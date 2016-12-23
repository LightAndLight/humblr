{-# LANGUAGE OverloadedStrings #-}

module Humblr.Endpoints.Compose (compose) where

import           Lucid
import           Web.Scotty

import           Humblr.Html

compose :: ScottyM ()
compose = get "/compose" . html $ renderText composePage

composePage :: Html ()
composePage = page $ PageConfig "Compose" header body []
  where
    header = h1_ "What are you thinking?"
    body = do
      with form_ [id_ "compose", action_ "/posts", method_ "post"] $ do
        input_ [type_ "text", name_ "title", id_ "title", placeholder_ "Title"]
        br_ []

        with textarea_ [form_ "compose", name_ "body", id_ "body"] ""
        br_ []

        input_ [type_ "submit", value_ "Submit"]
