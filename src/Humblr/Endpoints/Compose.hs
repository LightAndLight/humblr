{-# LANGUAGE OverloadedStrings #-}

module Humblr.Endpoints.Compose (compose) where

import           Lucid
import           Web.Scotty

import           Humblr.Html

compose :: ScottyM ()
compose = get "/compose" . html $ renderText composePage

composePage :: Html ()
composePage = page $ PageConfig "Compose" body []
  where
    body = do
      with form_ [action_ "/posts", method_ "post"] $ do
        input_ [type_ "text", name_ "title", id_ "title", placeholder_ "Title"]
        br_ []

        input_ [type_ "textarea", name_ "body", id_ "body"]
        br_ []

        input_ [type_ "submit", value_ "Submit"]
