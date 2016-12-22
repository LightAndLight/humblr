module Humblr (humblr) where

import           Database.PostgreSQL.Simple (Connection)
import           Web.ClientSession          (Key)
import           Web.Scotty

import           Humblr.Endpoints

humblr :: Key -> Connection -> ScottyM ()
humblr key conn = do
  compose
  home key conn
  login key conn
  posts key conn
  register key conn
