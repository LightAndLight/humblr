{-# LANGUAGE OverloadedStrings #-}

module Humblr.Html where

import           Control.Monad      (void)
import qualified Data.Map           as M
import           Data.Monoid
import           Data.Serialize     (Serialize)
import qualified Data.Serialize     as B
import           Data.Text          (Text)
import           Data.Text.Encoding (decodeUtf8, encodeUtf8)
import           Lucid

data DisplayUser = DisplayUser { displayUserId :: Int, displayUsername :: Text }
instance Serialize DisplayUser where
  put user = do
    B.put (displayUserId user)
    B.put $ encodeUtf8 (displayUsername user)

  get = DisplayUser <$> B.get <*> (decodeUtf8 <$> B.get)

homepage :: Maybe DisplayUser -> M.Map Text Text -> Html ()
homepage maybeUser errs = doctypehtml_ $ do
  head_ $ title_ "Humblr"
  body_ $ do
    h1_ . toHtml $ "Welcome to Humblr" <> maybe "" (mappend ", " . displayUsername) maybeUser
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
