{-# language OverloadedStrings, TypeOperators, DataKinds, DeriveGeneric #-}

module Humblr (humblr) where

import Control.Lens ((^.), _2, _3)
import Control.Monad.IO.Class (liftIO)
import Crypto.KDF.Scrypt
import Data.Aeson
import Data.Aeson.Types (typeMismatch)
import Data.ByteString (ByteString)
import Data.ByteString.Char8 (pack)
import Data.Text (Text)
import Data.Text.Encoding (encodeUtf8)
import Database.PostgreSQL.Simple (Connection)
import GHC.Generics
import Network.Wai (Application)
import Opaleye (runQuery)
import Servant
import System.Entropy

import qualified Humblr.Database as D

humblr :: Connection -> Application
humblr conn = serve humblrAPI $ server conn

data User = User { _userId :: Int, _username :: Text }
  deriving (Eq, Generic, Show)

instance ToJSON User where


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


type HumblrAPI = "register" :> ReqBody '[JSON] RegisterUser :> Post '[JSON] Text
            :<|> "login" :> ReqBody '[JSON] LoginUser :> Post '[JSON] Text
            :<|> "user" :> Capture "user" Int :> "posts" :> Get '[JSON] [UserPost]
            :<|> "user" :> Capture "user" Int :> "posts" :> "add"
                 :> ReqBody '[JSON] UserPost :> Post '[JSON] Text
            :<|> "users" :> Get '[JSON] [User]
            :<|> "posts" :> Get '[JSON] [UserPost]

humblrAPI :: Proxy HumblrAPI
humblrAPI = Proxy

genHash :: Text -> ByteString -> ByteString
genHash password salt = generate (Parameters 1024 42 42 100) (encodeUtf8 password) salt

server :: Connection -> Server HumblrAPI
server conn = register :<|> login :<|> userPosts :<|> createPost :<|> allUsers :<|> allPosts 
  where
    register (RegisterUser username email password) = do
        user <- liftIO $ D.selectUserByUsername conn username
        case user of
            Just _ -> return "User already exists"
            Nothing -> do
                salt <- liftIO $ getEntropy 100
                liftIO $ D.insertUser conn username email (genHash password salt) salt 
                return "User created"

    login (LoginUser username password) = do
        user <- liftIO $ D.selectUserByUsername conn username
        return $ case user of
            Nothing -> "User does not exist"
            Just userRow -> if genHash password (D._userSalt userRow) == D._userPasswordHash userRow
                then "Logged in"
                else "Incorrect password"

    userPosts userId = do
        rows <- liftIO $ D.selectPostsForUser conn userId 
        return $ map (\x -> UserPost (Just $ D._postId x) (D._postUserId x) (D._postTitle x) (D._postBody x)) rows

    createPost userId post = do
        liftIO $ D.insertPost conn userId (_title post) (_body post)
        return "post created"

    allUsers = do
        rows <- liftIO $ D.selectUsers conn
        return $ map (\x -> User (D._userId x) (D._userName x)) rows

    allPosts = do
        rows <- liftIO $ D.selectPosts conn
        return $ map (\x -> UserPost (Just $ D._postId x) (D._postUserId x) (D._postTitle x) (D._postBody x)) rows
