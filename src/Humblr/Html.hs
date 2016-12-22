{-# LANGUAGE OverloadedStrings #-}

module Humblr.Html where

import           Control.Lens
import           Data.Foldable           (traverse_)
import           Data.Map                (Map)
import qualified Data.Map                as M (lookup)
import           Data.Monoid
import           Data.Serialize          (Serialize)
import qualified Data.Serialize          as B
import           Data.Text               (Text)
import           Data.Text.Encoding      (decodeUtf8, encodeUtf8)
import           Data.Time.Format
import           Lucid

import           Humblr.Database.Models
import           Humblr.Database.Queries (PostWithAuthor)

data PageConfig = PageConfig { pageTitle :: Text, pageBody :: Html (), pageScripts :: [Text] }

data DisplayUser = DisplayUser { displayUserId :: Int, displayUsername :: Text }
instance Serialize DisplayUser where
  put user = do
    B.put (displayUserId user)
    B.put $ encodeUtf8 (displayUsername user)

  get = DisplayUser <$> B.get <*> (decodeUtf8 <$> B.get)

script :: Text -> Html ()
script name = with (script_ "") [type_ "text/javascript", src_ name]

page :: PageConfig -> Html ()
page config
  = doctypehtml_ $ do
      head_ . title_ . toHtml $ pageTitle config <> " - Humblr"
      body_ $ pageBody config
      traverse_ script $ pageScripts config
      with (script_ "") [type_ "text/javascript", src_ "/scripts/date.js"]

loginForm :: Map Text Text -> Html ()
loginForm errs = do
  with form_ [method_ "post", action_ "/login"] $ do
    with label_ [for_ "username"] "Username: "
    input_ [type_ "text", name_ "username", id_ "username"]
    br_ []
    maybe "" (with span_ [class_ "error"] . toHtml) $ M.lookup "username" errs
    br_ []

    with label_ [for_ "password"] "Password: "
    input_ [type_ "password", name_ "password", id_ "password"]
    maybe "" (with span_ [class_ "error"] . toHtml) $ M.lookup "password" errs
    br_ []
    br_ []

    input_ [type_ "submit", value_ "Log In"]

postTemplate :: PostWithAuthor -> Html ()
postTemplate post
  = with section_ [class_ "post"] $ do
      h3_ $ toHtml (post ^. postTitle)
      p_ $ toHtml (post ^. postAuthor)
      with p_ [class_ "date"] . toHtml $ formatTime defaultTimeLocale "%s" (post ^. postCreated)
      with div_ [class_ "post-content"] $ toHtml (post ^. postBody)
