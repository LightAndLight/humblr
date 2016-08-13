{-# language OverloadedStrings, TypeOperators, DataKinds, DeriveGeneric #-}

module Humblr (humblr) where

import Control.Lens ((^.), _2, _3)
import Control.Monad.IO.Class (liftIO)
import Data.Aeson (FromJSON, ToJSON)
import Data.Text (Text)
import Database.PostgreSQL.Simple (Connection)
import GHC.Generics
import Network.Wai (Application)
import Opaleye (runQuery)
import Servant

import qualified Humblr.Database as D

humblr :: Connection -> Application
humblr conn = serve humblrAPI $ server conn

data User = User { _userId :: Int, _username :: Text }
  deriving (Eq, Generic, Show)

instance ToJSON User where

data UserPost = UserPost { _postId :: Maybe Int, _title :: Text, _body :: Text }
  deriving (Eq, Generic, Show)

instance ToJSON UserPost where

instance FromJSON UserPost where

type HumblrAPI = "user" :> Capture "user" Int :> "posts" :> Get '[JSON] [UserPost]
            :<|> "user" :> Capture "user" Int :> "posts" :> "add"
                 :> ReqBody '[JSON] UserPost :> Post '[JSON] Text
            :<|> "users" :> Get '[JSON] [User]
            :<|> "posts" :> Get '[JSON] [UserPost]

humblrAPI :: Proxy HumblrAPI
humblrAPI = Proxy

server :: Connection -> Server HumblrAPI
server conn = userPosts :<|> createPost :<|> allUsers :<|> allPosts 
  where
    userPosts userId = do
        rows <- liftIO $ D.selectPostsForUser conn userId 
        return $ map (\x -> UserPost (Just $ D.postId x) (D.postTitle x) (D.postBody x)) rows
    createPost userId post = do
        liftIO $ D.insertPostForUser conn userId (_title post) (_body post)
        return "post created"
    allUsers = do
        rows <- liftIO $ D.selectUsers conn
        return $ map (\x -> User (D.userId x) (D.userName x)) rows
    allPosts = do
        rows <- liftIO $ D.selectPosts conn
        return $ map (\x -> UserPost (Just $ D.postId x) (D.postTitle x) (D.postBody x)) rows
