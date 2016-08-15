{-# language OverloadedStrings, TypeOperators, TypeFamilies, DataKinds, DeriveGeneric #-}

module Humblr (humblr) where

import Control.Lens ((^.), _2, _3)
import Control.Monad.IO.Class (liftIO)
import Crypto.KDF.Scrypt
import Data.Aeson
import Data.Aeson.Types (typeMismatch)
import Data.ByteString (ByteString)
import Data.ByteString.Char8 (pack)
import Data.Serialize (Serialize, get, put)
import qualified Data.Serialize as B
import Data.Text (Text)
import Data.Text.Encoding (decodeUtf8, encodeUtf8)
import Database.PostgreSQL.Simple (Connection)
import GHC.Generics
import Network.Wai (Application, Request, requestHeaders)
import Opaleye (runQuery)
import Servant
import Servant.API.Experimental.Auth
import Servant.Server.Experimental.Auth
import Servant.Utils.StaticFiles
import System.Entropy
import Web.ClientSession

import qualified Humblr.Database as D

humblr :: Key -> Connection -> Application
humblr key conn = serveWithContext humblrAPI (genAuthServerContext key) (server key conn)


newtype Token = Token { token :: Text }
  deriving (Eq, Generic, Show)

instance ToJSON Token where

data User = User { _userId :: Int, _username :: Text }
  deriving (Eq, Generic, Show)

instance ToJSON User where

instance Serialize User where
    put user = do
        put $ _userId user
        put . encodeUtf8 $ _username user 

    get = User <$> get <*> (decodeUtf8 <$> get)


data RegisterUser = RegisterUser Text Text Text deriving (Eq, Show)

instance FromJSON RegisterUser where
    parseJSON (Object v) = RegisterUser <$>
        v .: "username" <*>
        v .: "email" <*>
        v .: "password"
    parseJSON invalid = typeMismatch "RegisterUser" invalid

data LoginUser = LoginUser Text Text deriving (Eq, Show)

instance FromJSON LoginUser where
    parseJSON (Object v) = LoginUser <$>
        v .: "username" <*>
        v .: "password"
    parseJSON invalid = typeMismatch "LoginUser" invalid


data UserPost = UserPost { _postId :: Maybe Int, _ownerId :: Int, _title :: Text, _body :: Text }
  deriving (Eq, Generic, Show)

instance ToJSON UserPost where
instance FromJSON UserPost where

data CreatePost = CreatePost Text Text

instance FromJSON CreatePost where
    parseJSON (Object v) = CreatePost <$>
        v .: "title" <*>
        v .: "body"
    parseJSON invalid = typeMismatch "CreatePost" invalid


type HumblrAPI = "register" :> ReqBody '[JSON] RegisterUser :> Post '[JSON] Text
            :<|> "login" :> ReqBody '[JSON] LoginUser :> Post '[JSON] Token
            :<|> "user" :> Capture "user" Int :> "posts" :> Get '[JSON] [UserPost]
            :<|> "my" :> "posts" :> AuthProtect "cookie-auth" :> Get '[JSON] [UserPost]
            :<|> "my" :> "posts" :> AuthProtect "cookie-auth" :> "add" :> ReqBody '[JSON] CreatePost :> Post '[JSON] Text
            :<|> "users" :> Get '[JSON] [User]
            :<|> "posts" :> Get '[JSON] [UserPost]
            :<|> Raw

humblrAPI :: Proxy HumblrAPI
humblrAPI = Proxy

genHash :: Text -> ByteString -> ByteString
genHash password salt = generate (Parameters 1024 42 42 100) (encodeUtf8 password) salt

authHandler :: Key -> AuthHandler Request User
authHandler key = mkAuthHandler $ \req -> case lookup "auth" (requestHeaders req) of
    Nothing -> throwError $ err401 { errBody = "Missing auth header" }
    Just cookie -> case decrypt key cookie of
        Nothing -> throwError $ err403 { errBody = "Invalid cookie" }
        Just serialized -> case B.decode serialized of
            Left _ -> throwError $ err403 { errBody = "Invalid cookie" }
            Right user -> return user

type instance AuthServerData (AuthProtect "cookie-auth") = User

genAuthServerContext :: Key -> Context (AuthHandler Request User ': '[])
genAuthServerContext key = (authHandler key) :. EmptyContext

data LoginError = UserDoesNotExist
                | PasswordIncorrect

showLoginError :: LoginError -> String
showLoginError UserDoesNotExist = "User does not exist"
showLoginError PasswordIncorrect = "Incorrect password"

instance ToJSON LoginError where
    toJSON e = object ["error" .= showLoginError e]

server :: Key -> Connection -> Server HumblrAPI
server key conn = register :<|> login :<|> userPosts :<|> myPosts :<|> createPost :<|> allUsers :<|> allPosts :<|> serveDirectory "dist"
  where
    register (RegisterUser username email password) = do
        user <- liftIO $ D.selectUserByUsername conn username
        case user of
            Just _ -> throwError $ err401 { errBody = "User already exists" }
            Nothing -> do
                salt <- liftIO $ getEntropy 100
                liftIO $ D.insertUser conn username email (genHash password salt) salt 
                return "User created"

    login (LoginUser username password) = do
        user <- liftIO $ D.selectUserByUsername conn username
        case user of
            Nothing -> throwError $ err401 { errBody = encode UserDoesNotExist }
            Just userRow -> if genHash password (D._userSalt userRow) /= D._userPasswordHash userRow
                then throwError $ err401 { errBody = encode PasswordIncorrect }
                else do
                    t <- liftIO $ encryptIO key
                        (B.encode $ User (D._userId userRow) (D._userName userRow))
                    return (Token $ decodeUtf8 t)

    userPosts userId = do
        rows <- liftIO $ D.selectPostsForUser conn userId 
        return $ map (\x -> UserPost (Just $ D._postId x) (D._postUserId x) (D._postTitle x) (D._postBody x)) rows

    myPosts user = userPosts $ _userId user

    createPost user (CreatePost title body) = do
        liftIO $ D.insertPost conn (_userId user) title body
        return "post created"

    allUsers = do
        rows <- liftIO $ D.selectUsers conn
        return $ map (\x -> User (D._userId x) (D._userName x)) rows

    allPosts = do
        rows <- liftIO $ D.selectPosts conn
        return $ map (\x -> UserPost (Just $ D._postId x) (D._postUserId x) (D._postTitle x) (D._postBody x)) rows
