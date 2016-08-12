{-# language TypeOperators, DataKinds, DeriveGeneric #-}

module Humblr (humblr) where

import Control.Lens ((^.), _2, _3)
import Control.Monad.IO.Class (liftIO)
import Data.Aeson (ToJSON)
import Database.PostgreSQL.Simple (Connection)
import GHC.Generics
import Network.Wai (Application)
import Opaleye (runQuery)
import Servant hiding (Post)

import qualified Humblr.Database as D

humblr :: Connection -> Application
humblr conn = serve humblrAPI $ server conn

data User = User { _username :: String }
  deriving (Eq, Generic, Show)

instance ToJSON User where

data Post = Post { _title :: String, _body :: String }
  deriving (Eq, Generic, Show)

instance ToJSON Post where

type HumblrAPI = Capture "user" String :> "posts" :> Get '[JSON] [Post]
             :<|> "users" :> Get '[JSON] [User]
             :<|> "posts" :> Get '[JSON] [Post]

humblrAPI :: Proxy HumblrAPI
humblrAPI = Proxy

server :: Connection -> Server HumblrAPI
server conn = userPosts :<|> allUsers :<|> allPosts 
  where
    userPosts name = do
        rows <- liftIO $ (runQuery conn (D.postsForUser name) :: IO [D.Post' Int String String])
        return $ map (\x -> Post (D.postTitle x) (D.postBody x)) rows
    allUsers = do
        rows <- liftIO $ (runQuery conn D.userQuery :: IO [D.User' Int String String String])
        return $ map (User . D.userName) rows
    allPosts = do
        rows <- liftIO $ (runQuery conn D.postQuery :: IO [D.Post' Int String String])
        return $ map (\x -> Post (D.postTitle x) (D.postBody x)) rows
