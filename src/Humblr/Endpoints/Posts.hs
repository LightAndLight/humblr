{-# LANGUAGE OverloadedStrings #-}

module Humblr.Endpoints.Posts (posts) where

import           Control.Lens
import           Control.Monad.IO.Class
import           Data.Monoid
import           Data.Text
import qualified Data.Text.Lazy             as L
import           Data.Time.Format
import           Database.PostgreSQL.Simple (Connection)
import           Lucid
import           Network.HTTP.Types.Status
import           Web.ClientSession
import           Web.FormUrlEncoded
import           Web.Scotty
import           Web.Scotty.Cookie

import           Humblr.Database.Models
import           Humblr.Database.Queries
import           Humblr.Html
import           Humblr.Util

data WritePost = WritePost { writePostTitle :: Text, writePostBody :: Text }
instance FromForm WritePost where
  fromForm form
    = WritePost <$>
      parseUnique "title" form <*>
      parseUnique "body" form

posts :: Key -> Connection -> ScottyM ()
posts key conn = do
  post "/posts" $ do
    cookie <- getCookie "auth"
    let maybeUser = cookie >>= decodeCookie key
    case maybeUser of
      Nothing -> do
        status status401
        html "Unauthorized"
      Just user -> do
        payload <- body
        case urlDecodeForm payload >>= fromForm of
          Left err -> raise $ L.fromStrict err
          Right post -> do
            createdId <- liftIO $ insertPost conn (displayUserId user) (writePostTitle post) (writePostBody post)
            status status303
            setHeader "Location" $ "/posts/" <> L.pack (show createdId)
  get "/posts/:id" $ do
    viewPostId <- param "id"
    maybePost <- liftIO $ selectPostById conn viewPostId
    maybe (status status404) (html . renderText . postPage) maybePost

postPage :: PostWithAuthor -> Html ()
postPage post = page $ PageConfig (post ^. postTitle) header body []
  where
    header = do
      with h1_ [id_ "post-title"]$ toHtml (post ^. postTitle)
      span_ . toHtml $ (post ^. postAuthor) <> " — "
      with span_ [class_ "date"] . toHtml $ formatTime defaultTimeLocale "%s" (post ^. postCreated)
    body = do
      with div_ [class_ "post-content"] $ toHtml (post ^. postBody)
