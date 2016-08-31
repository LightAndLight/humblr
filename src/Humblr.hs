{-# language OverloadedStrings, TypeOperators, TypeFamilies, DataKinds, DeriveGeneric, FlexibleInstances #-}

module Humblr (humblr) where

import Control.Lens ((^.))
import Control.Monad.IO.Class (liftIO)
import Crypto.KDF.Scrypt
import Data.Aeson
import Data.Aeson.Types (typeMismatch)
import Data.ByteString (ByteString)
import Data.ByteString.Char8 (pack)
import Data.Maybe (fromJust)
import Data.Serialize (Serialize, get, put)
import qualified Data.Serialize as B
import Data.Text (Text)
import Data.Text.Encoding (decodeUtf8, encodeUtf8)
import Database.PostgreSQL.Simple (Connection)
import GHC.Generics
import Network.Wai (Application, Request, requestHeaders)
import Opaleye (runQuery)
import Servant hiding (Post)
import qualified Servant as S (Post)
import Servant.API.Experimental.Auth
import Servant.Server.Experimental.Auth
import Servant.Utils.StaticFiles
import System.Entropy
import Web.ClientSession

import Humblr.Database

humblr :: Key -> Connection -> Application
humblr key conn = serveWithContext humblrAPI (genAuthServerContext key) (server key conn)


newtype Token = Token { token :: Text }
  deriving (Eq, Generic, Show)

instance ToJSON Token where

type UserInfo = User' Int Text Text () ()
instance ToJSON UserInfo where
    toJSON (User uid uname uemail _ _) = object [
        "id" .= uid
        , "username" .= uname
        , "email" .= uemail
        ]

type RegisterUser = User' () Text Text Text ()
instance FromJSON RegisterUser where
    parseJSON (Object v) = User () <$>
        v .: "username" <*>
        v .: "email" <*>
        v .: "password" <*>
        pure ()
    parseJSON invalid = typeMismatch "RegisterUser" invalid

type LoginUser = User' () Text () Text ()
instance FromJSON LoginUser where
    parseJSON (Object v) = User () <$>
        v .: "username" <*>
        pure () <*>
        v .: "password" <*>
        pure ()
    parseJSON invalid = typeMismatch "LoginUser" invalid

type DisplayUser = User' Int Text () () ()
instance Serialize DisplayUser where
    put user = do
        put (user ^. userId)
        put $ encodeUtf8 (user ^. userName) 

    get = User <$>
        get <*>
        (decodeUtf8 <$> get) <*>
        pure () <*>
        pure () <*>
        pure ()

instance ToJSON DisplayUser where
    toJSON (User uid uname _ _ _) = object [
        "id" .= uid
        , "username" .= uname
        ]

type Post = Post' Int Text Text Text
instance ToJSON Post where
    toJSON (Post pid puser ptitle pbody) = object [
        "id" .= pid
        , "author" .= puser
        , "title" .= ptitle
        , "body" .= pbody
        ]

type CreatePost = Post' () () Text Text
instance FromJSON CreatePost where
    parseJSON (Object v) = Post () () <$>
        v .: "title" <*>
        v .: "body"
    parseJSON invalid = typeMismatch "CreatePost" invalid


type HumblrAPI = "register" :> ReqBody '[JSON] RegisterUser :> S.Post '[JSON] Text
            :<|> "login" :> ReqBody '[JSON] LoginUser :> S.Post '[JSON] Token
            :<|> "user" :> Capture "user" Text :> "posts" :> Get '[JSON] [Post]
            :<|> "me" :> AuthProtect "cookie-auth" :> Get '[JSON] UserInfo
            :<|> "my" :> "posts" :> AuthProtect "cookie-auth" :> Get '[JSON] [Post]
            :<|> "my" :> "posts" :> AuthProtect "cookie-auth" :> "add" :> ReqBody '[JSON] CreatePost :> S.Post '[JSON] Text
            :<|> "users" :> Get '[JSON] [DisplayUser]
            :<|> "posts" :> Get '[JSON] [Post]
            :<|> Raw

humblrAPI :: Proxy HumblrAPI
humblrAPI = Proxy

genHash :: Text -> ByteString -> ByteString
genHash password salt = generate (Parameters 1024 42 42 100) (encodeUtf8 password) salt

authHandler :: Key -> AuthHandler Request DisplayUser
authHandler key = mkAuthHandler $ \req -> case lookup "auth" (requestHeaders req) of
    Nothing -> throwError $ err401 { errBody = "Missing auth header" }
    Just cookie -> case decrypt key cookie of
        Nothing -> throwError $ err403 { errBody = "Invalid cookie" }
        Just serialized -> case B.decode serialized of
            Left _ -> throwError $ err403 { errBody = "Invalid cookie" }
            Right user -> return user

type instance AuthServerData (AuthProtect "cookie-auth") = DisplayUser

genAuthServerContext :: Key -> Context (AuthHandler Request DisplayUser ': '[])
genAuthServerContext key = (authHandler key) :. EmptyContext

data LoginError = UserDoesNotExist
                | PasswordIncorrect

showLoginError :: LoginError -> String
showLoginError UserDoesNotExist = "User does not exist"
showLoginError PasswordIncorrect = "Incorrect password"

instance ToJSON LoginError where
    toJSON e = object ["error" .= showLoginError e]

server :: Key -> Connection -> Server HumblrAPI
server key conn = register :<|> login :<|> userPosts :<|> me :<|> myPosts :<|> createPost :<|> allUsers :<|> allPosts :<|> serveDirectory "dist"
  where
    register :: RegisterUser -> Handler Text
    register user = do
        let username = user ^. userName
            email = user ^. userEmail
            password = user ^. userPassword
        maybeUser <- liftIO $ selectUserByUsername conn username
        case maybeUser of
            Just _ -> throwError $ err401 { errBody = "User already exists" }
            Nothing -> do
                salt <- liftIO $ getEntropy 100
                liftIO $ insertUser conn username email (genHash password salt) salt 
                return "User created"

    login :: LoginUser -> Handler Token
    login user = do
        let username = user ^. userName
            password = user ^. userPassword
        maybeUser <- liftIO $ selectUserByUsername conn username
        case maybeUser of
            Nothing -> throwError $ err401 { errBody = encode UserDoesNotExist }
            Just userRow -> if genHash password (userRow ^. userSalt) /= userRow ^. userPassword
                then throwError $ err401 { errBody = encode PasswordIncorrect }
                else do
                    t <- liftIO $ encryptIO key
                        (B.encode $ userRow { _userEmail = (), _userPassword = (), _userSalt = () })
                    return (Token $ decodeUtf8 t)

    userPosts :: Text -> Handler [Post]
    userPosts username = do
        maybeUser <- liftIO $ selectUserByUsername conn username
        case maybeUser of
            Nothing -> throwError $ err401 { errBody = encode UserDoesNotExist }
            Just user -> do
                rows <- liftIO $ selectPostsForUser conn (user ^. userId)
                return $ map (\row -> row { _postUserId = username }) rows

    me :: DisplayUser -> Handler UserInfo
    me user = do
        maybeUser <- liftIO $ selectUserById conn (user ^. userId)
        case maybeUser of
            Nothing -> throwError $ err401 { errBody = encode UserDoesNotExist }
            Just userRow -> return userRow { _userPassword = (), _userSalt = () }
        

    myPosts :: DisplayUser -> Handler [Post]
    myPosts user = do
        rows <- liftIO $ selectPostsForUser conn (user ^. userId)
        return $ map (\row -> row { _postUserId = user ^. userName }) rows

    createPost :: DisplayUser -> CreatePost -> Handler Text
    createPost user post = do
        liftIO $ insertPost conn (user ^. userId) (post ^. postTitle) (post ^. postBody)
        return "post created"

    allUsers :: Handler [DisplayUser]
    allUsers = do
        rows <- liftIO $ selectUsers conn
        return $ map (\row -> row { _userEmail = (), _userPassword = (), _userSalt = () }) rows

    allPosts :: Handler [Post]
    allPosts = do
        res <- liftIO $ selectPostsWithAuthors conn
        return $ map (\(post,user) -> post { _postUserId = fromJust (user ^. userName) }) res
