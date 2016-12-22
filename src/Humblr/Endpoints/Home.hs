{-# LANGUAGE OverloadedStrings #-}

module Humblr.Endpoints.Home where

import qualified Data.Map           as M
import           Data.Monoid
import           Data.Serialize     (Serialize)
import qualified Data.Serialize     as B
import qualified Data.Text          as T
import           Data.Text.Encoding (decodeUtf8, encodeUtf8)
import           Lucid
import           Web.ClientSession
import           Web.Scotty
import           Web.Scotty.Cookie

import           Humblr.Html

eitherToMaybe :: Either e a -> Maybe a
eitherToMaybe (Left _) = Nothing
eitherToMaybe (Right a) = Just a

data DisplayUser = DisplayUser { displayUserId :: Int, displayUsername :: T.Text }
instance Serialize DisplayUser where
  put user = do
    B.put (displayUserId user)
    B.put $ encodeUtf8 (displayUsername user)

  get = DisplayUser <$> B.get <*> (decodeUtf8 <$> B.get)

home :: Key -> ScottyM ()
home key
  = get "/" $ do
      cookie <- getCookie "auth"
      let maybeUser = encodeUtf8 <$> cookie >>= decrypt key >>= eitherToMaybe . B.decode
      html . renderText $ homePage maybeUser M.empty

homePage :: Maybe DisplayUser -> M.Map T.Text T.Text -> Html ()
homePage maybeUser errs = page (PageConfig "Home" body)
  where
    body = do
      h1_ . toHtml $ "Welcome to Humblr" <> maybe "" (mappend ", " . displayUsername) maybeUser
      maybe (loginForm errs) (const "") maybeUser
