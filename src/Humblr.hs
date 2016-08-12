{-# language TypeOperators, DataKinds, DeriveGeneric #-}

module Humblr (humblr) where

import Data.Aeson (ToJSON)
import Data.Text (Text)
import GHC.Generics
import Network.Wai (Application)
import Servant hiding (Post)

humblr :: Application
humblr = serve humblrAPI server

data User = User { _username :: Text }
  deriving (Eq, Generic, Show)

instance ToJSON User where

data Post = Post { _title :: Text, _body :: Text }
  deriving (Eq, Generic, Show)

instance ToJSON Post where

type HumblrAPI = "users" :> Get '[JSON] [User]
             :<|> "posts" :> Get '[JSON] [Post]

humblrAPI :: Proxy HumblrAPI
humblrAPI = Proxy

server :: Server HumblrAPI
server = allUsers :<|> allPosts
  where
    allUsers = return []
    allPosts = return []
