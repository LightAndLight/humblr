{-# LANGUAGE OverloadedStrings #-}

module Humblr.Html where

import           Data.Map    (Map)
import qualified Data.Map    as M (lookup)
import           Data.Monoid
import           Data.Text   (Text)
import           Lucid

data PageConfig = PageConfig { pageTitle :: Text, pageBody :: Html () }

page :: PageConfig -> Html ()
page config
  = doctypehtml_ $ do
      head_ . title_ . toHtml $ pageTitle config <> " - Humblr"
      body_ $ pageBody config

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
