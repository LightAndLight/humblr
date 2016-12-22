{-# LANGUAGE DeriveGeneric     #-}
{-# LANGUAGE OverloadedStrings #-}

module Humblr (humblr) where

import           Control.Arrow
import           Control.Lens               hiding ((.=))
import           Control.Monad.Except
import           Control.Monad.IO.Class     (liftIO)
import           Control.Monad.Reader
import           Data.Aeson                 (FromJSON (..), ToJSON (..),
                                             Value (..), object, (.:), (.=))
import           Data.Aeson.Encode.Pretty   (encodePretty)
import           Data.Aeson.Types           (typeMismatch)
import           Data.ByteString            (ByteString)
import           Data.ByteString.Char8      (pack)
import           Data.Check.Field
import           Data.Functor.Contravariant
import qualified Data.List.NonEmpty         as N
import qualified Data.Map                   as M
import           Data.Maybe                 (fromJust, isJust)
import           Data.Monoid
import           Data.Profunctor
import           Data.Serialize             (Serialize)
import qualified Data.Serialize             as B
import qualified Data.Text                  as T
import           Data.Text.Encoding         (decodeUtf8, encodeUtf8)
import qualified Data.Text.Lazy             as L
import           Data.Time                  (UTCTime)
import           Data.Time.Clock.POSIX      (utcTimeToPOSIXSeconds)
import           Database.PostgreSQL.Simple (Connection)
import           GHC.Generics
import           Lucid
import           Network.Wai                (Application, Request,
                                             requestHeaders)
import           Opaleye                    (runQuery)
import           Web.ClientSession          (Key)
import           Web.Scotty

import           Humblr.Endpoints

humblr :: Key -> Connection -> ScottyM ()
humblr key conn = do
  home key
  login key conn
  register key conn

{-
type MyPostsAPI
  = Get '[JSON] [Post] :<|>
    ReqBody '[JSON] CreatePost :> PostCreated '[JSON] ()

type PostAPI
  = Get '[JSON] Post :<|>
    AuthProtect "cookie-auth" :> Delete '[JSON] Text :<|>
    AuthProtect "cookie-auth" :> ReqBody '[JSON] CreatePost :> Patch '[JSON] Text

type HumblrAPI
  = "register" :> ReqBody '[JSON] RegisterUser :> PostCreated '[JSON] () :<|>
    "user" :> Capture "user" Text :> "posts" :> Get '[JSON] [Post] :<|>
    "me" :> AuthProtect "cookie-auth" :> Get '[JSON] UserInfo :<|>
    "my" :> "posts" :> AuthProtect "cookie-auth" :> MyPostsAPI :<|>
    "users" :> Get '[JSON] [DisplayUser] :<|>
    "posts" :> Get '[JSON] [Post] :<|>
    "posts" :> Capture "postId" Int :> PostAPI :<|>
    Get '[HTML] (Html ())
-}


newtype Token = Token { token :: T.Text }
  deriving (Eq, Generic, Show)

instance ToJSON Token where



data DisplayPost
  = DisplayPost
  { displayPostId     :: Int
  , displayPostAuthor :: T.Text
  , displayPostDate   :: UTCTime
  , displayPostTitle  :: T.Text
  , displayPostBody   :: T.Text
  }
instance ToJSON DisplayPost where
  toJSON post
    = object
      [ "id" .= displayPostId post
      , "author" .= displayPostAuthor post
      , "created" .= (floor $ utcTimeToPOSIXSeconds (displayPostDate post) :: Int)
      , "title" .= displayPostTitle post
      , "body" .= displayPostBody post
      ]

instance FromJSON DisplayPost where
  parseJSON (Object v)
    = DisplayPost <$>
      v .: "id" <*>
      v .: "author" <*>
      v .: "created" <*>
      v .: "title" <*>
      v .: "body"

{-
runValidation :: ToJSON e => ServantErr -> a -> CheckFieldT IO e a b -> (b -> Handler c) -> Handler c
runValidation errCode input validator ifValid = do
  res <- liftIO $ checkT validator input
  case res of
    Right b -> ifValid b
    Left err -> throwError errCode { errBody = encodePretty (M.singleton ("errors" :: Text) err) }
-}


{-
authHandler :: Key -> AuthHandler Request DisplayUser
authHandler key
  = mkAuthHandler $ \req -> case lookup "auth" (requestHeaders req) of
      Nothing -> throwError $ err401 { errBody = "Missing auth header" }
      Just cookie -> case decrypt key cookie of
        Nothing -> throwError $ err403 { errBody = "Invalid cookie" }
        Just serialized -> case B.decode serialized of
          Left _ -> throwError $ err403 { errBody = "Invalid cookie" }
          Right user -> return user

type instance AuthServerData (AuthProtect "cookie-auth") = DisplayUser

genAuthServerContext :: Key -> Context (AuthHandler Request DisplayUser ': '[])
genAuthServerContext key = authHandler key :. EmptyContext

instance ToJSON LoginError where
  toJSON UserDoesNotExist = toJSON ("User does not exist" :: Text)
  toJSON PasswordIncorrect = toJSON ("Incorrect password" :: Text)

myPostsServer :: Key -> Connection -> DisplayUser -> Server MyPostsAPI
myPostsServer key conn user = myPosts :<|> createPost
  where
    myPosts :: Handler [Post]
    myPosts = do
      rows <- liftIO $ selectPostsForUser conn (user ^. userId)
      return $ fmap (postAuthor .~ user ^. userName) rows

    createPost :: CreatePost -> Handler ()
    createPost post
      = void . liftIO $ insertPost conn (user ^. userId) (post ^. postTitle) (post ^. postBody)

postServer :: Key -> Connection -> Int -> Server PostAPI
postServer key conn pid = postById :<|> deletePostEndpoint :<|> updatePostEndpoint
  where
    postById :: Handler Post
    postById = do
      maybePost <- liftIO $ selectPostById conn pid
      case maybePost of
        Nothing -> throwError $ err401 { errBody = "Post does not exist" }
        Just post -> return post

    deletePostEndpoint :: DisplayUser -> Handler Text
    deletePostEndpoint user = do
      maybePost <- liftIO $ selectPostById conn pid
      case maybePost of
        Nothing -> throwError $ err401 { errBody = "Post does not exist" }
        Just post
          | user ^. userName == post ^. postAuthor -> do
              liftIO $ deletePost conn pid
              return "Post deleted"
          | otherwise -> throwError $ err401 { errBody = "You don't own that post" }

    updatePostEndpoint :: DisplayUser -> CreatePost -> Handler Text
    updatePostEndpoint user post = do
      maybePost <- liftIO $ selectPostById conn pid
      case maybePost of
        Nothing -> throwError $ err401 { errBody = "Post does not exist" }
        Just post'
          | user ^. userName == post' ^. postAuthor -> do
              liftIO $ updatePost conn pid (post ^. postTitle) (post ^. postBody)
              return "Post updated"
          | otherwise -> throwError $ err401 { errBody = "You don't own that post" }

server :: Key -> Connection -> Server HumblrAPI
server key conn
  = register :<|>
    login :<|>
    userPosts :<|>
    me :<|>
    myPostsServer key conn :<|>
    allUsers :<|>
    allPosts :<|>
    postServer key conn :<|>
    homepage
  where
    {-
    -}



    userPosts :: Text -> Handler [Post]
    userPosts username = do
      maybeUser <- liftIO $ selectUserByUsername conn username
      case maybeUser of
        Nothing -> throwError $ err401 { errBody = encodePretty UserDoesNotExist }
        Just user -> do
          rows <- liftIO $ selectPostsForUser conn (user ^. userId)
          return $ fmap (postAuthor .~ username) rows

    me :: DisplayUser -> Handler UserInfo
    me user = do
      maybeUser <- liftIO $ selectUserById conn (user ^. userId)
      case maybeUser of
        Nothing -> throwError $ err401 { errBody = encodePretty UserDoesNotExist }
        Just userRow -> return (userRow & userPassword .~ () & userSalt .~ ())

    allUsers :: Handler [DisplayUser]
    allUsers = do
      rows <- liftIO $ selectUsers conn
      return $ fmap (set userEmail () . set userPassword () . set userSalt ()) rows

    allPosts :: Handler [Post]
    allPosts = liftIO $ selectPostsWithAuthors conn

-}
