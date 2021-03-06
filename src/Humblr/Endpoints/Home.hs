{-# LANGUAGE OverloadedStrings #-}

module Humblr.Endpoints.Home where

import           Control.Lens
import           Control.Monad.IO.Class
import           Data.Foldable
import qualified Data.Map                   as M
import           Data.Monoid
import qualified Data.Serialize             as B
import qualified Data.Text                  as T
import           Data.Time                  (UTCTime)
import           Data.Time.Format
import           Database.PostgreSQL.Simple (Connection)
import           Lucid
import           Web.ClientSession
import           Web.Scotty
import           Web.Scotty.Cookie

import           Humblr.Database.Models
import           Humblr.Database.Queries
import           Humblr.Html
import           Humblr.Util

home :: Key -> Connection -> ScottyM ()
home key conn
  = get "/" $ do
      cookie <- getCookie "auth"
      let maybeUser = cookie >>= decodeCookie key
      pageData <- liftIO $ maybe (pure Nothing) (\u -> Just . (,) u <$> selectPostsForUser conn (displayUserId u)) maybeUser
      html . renderText $ homePage pageData M.empty

homePage :: Maybe (DisplayUser, [PostWithAuthor]) -> M.Map T.Text T.Text -> Html ()
homePage userData errs = page $ PageConfig "Home" header body []
  where
    welcome = "Welcome to Humblr"
    header = h1_ . toHtml $ welcome <> maybe "" (mappend ", " . displayUsername . fst) userData
    body = do
      case userData of
        Nothing -> loginForm errs
        Just (user,posts) -> do
          with a_ [href_ "/compose"] $ h2_ "Write a post"
          traverse_ postTemplate posts
