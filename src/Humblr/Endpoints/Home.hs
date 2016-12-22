{-# LANGUAGE OverloadedStrings #-}

module Humblr.Endpoints.Home where

import           Control.Lens
import           Control.Monad.IO.Class
import           Data.Foldable
import qualified Data.Map                   as M
import           Data.Monoid
import           Data.Serialize             (Serialize)
import qualified Data.Serialize             as B
import qualified Data.Text                  as T
import           Data.Text.Encoding         (decodeUtf8, encodeUtf8)
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

data DisplayUser = DisplayUser { displayUserId :: Int, displayUsername :: T.Text }
instance Serialize DisplayUser where
  put user = do
    B.put (displayUserId user)
    B.put $ encodeUtf8 (displayUsername user)

  get = DisplayUser <$> B.get <*> (decodeUtf8 <$> B.get)

home :: Key -> Connection -> ScottyM ()
home key conn
  = get "/" $ do
      cookie <- getCookie "auth"
      let maybeUser = cookie >>= decodeCookie key
      pageData <- liftIO $ maybe (pure Nothing) (\u -> Just . (,) u <$> selectPostsForUser conn (displayUserId u)) maybeUser
      html . renderText $ homePage pageData M.empty

postTemplate :: PostWithAuthor -> Html ()
postTemplate post
  = with section_ [class_ "post"] $ do
      h3_ $ toHtml (post ^. postTitle)
      p_ $ toHtml (post ^. postAuthor)
      p_ . toHtml $ formatTime defaultTimeLocale "%F %X" (post ^. postCreated)
      with div_ [class_ "post-content"] $ toHtml (post ^. postBody)


homePage :: Maybe (DisplayUser, [PostWithAuthor]) -> M.Map T.Text T.Text -> Html ()
homePage userData errs = page (PageConfig "Home" body)
  where
    body = do
      let welcome = "Welcome to Humblr"
      case userData of
        Nothing -> do
          h1_ $ toHtml welcome
          loginForm errs
        Just (user,posts) -> do
          h1_ . toHtml $ welcome <> ", " <> displayUsername user
          with a_ [href_ "/compose"] $ h2_ "Write a post"
          traverse_ postTemplate posts
