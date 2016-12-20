{-# LANGUAGE OverloadedStrings #-}

module Humblr.Html (homepage) where

import           Control.Monad (void)
import qualified Data.Map      as M
import           Data.Text     (Text)
import           Lucid

homepage :: M.Map Text Text -> Html ()
homepage errs = doctypehtml_ $ do
  head_ $ title_ "Humblr"
  body_ $ do
    h1_ "Welcome to Humblr"
    with form_ [method_ "post", action_ "/login"] $ do
      with label_ [for_ "username"] $ pure "Username: "
      input_ [type_ "text", name_ "username", id_ "username"]
      maybe (return ()) (void . span_ . return) $ M.lookup "username" errs

      with label_ [for_ "password"] $ pure "Password: "
      input_ [type_ "password", name_ "password", id_ "password"]
      maybe (return ()) (void . span_ . return) $ M.lookup "password" errs

      input_ [type_ "submit", value_ "Log In"]
