module Humblr (humblr) where

import           Database.PostgreSQL.Simple    (Connection)
import           Network.Wai.Middleware.Static
import           Web.ClientSession             (Key)
import           Web.Scotty

import           Humblr.Endpoints

humblr :: Key -> Connection -> ScottyM ()
humblr key conn = do
  middleware static
  compose
  home key conn
  login key conn
  posts key conn
  register key conn
