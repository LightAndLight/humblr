{-# LANGUAGE DataKinds                  #-}
{-# LANGUAGE DeriveGeneric              #-}
{-# LANGUAGE FlexibleInstances          #-}
{-# LANGUAGE GeneralizedNewtypeDeriving #-}
{-# LANGUAGE OverloadedStrings          #-}
{-# LANGUAGE TypeFamilies               #-}
{-# LANGUAGE TypeOperators              #-}

module Humblr (humblr) where

import           Control.Lens                     (mapped, over, set, (&), (.~),
                                                   (^.))
import           Control.Monad.Except
import           Control.Monad.IO.Class           (liftIO)
import           Control.Monad.State
import           Crypto.KDF.Scrypt
import           Data.Aeson
import           Data.Aeson.Encode.Pretty         (encodePretty)
import           Data.Aeson.Types                 (typeMismatch)
import           Data.ByteString                  (ByteString)
import           Data.ByteString.Char8            (pack)
import qualified Data.Map                         as M
import           Data.Maybe                       (fromJust)
import           Data.Monoid
import           Data.Serialize                   (Serialize)
import qualified Data.Serialize                   as B
import           Data.Text                        (Text)
import qualified Data.Text                        as T
import           Data.Text.Encoding               (decodeUtf8, encodeUtf8)
import           Data.Time                        (UTCTime)
import           Data.Time.Clock.POSIX            (utcTimeToPOSIXSeconds)
import           Database.PostgreSQL.Simple       (Connection)
import           GHC.Generics
import           Network.Wai                      (Application, Request,
                                                   requestHeaders)
import           Opaleye                          (runQuery)
import           Servant                          hiding (Post)
import qualified Servant                          as S (Post)
import           Servant.API.Experimental.Auth
import           Servant.Server.Experimental.Auth
import           Servant.Utils.StaticFiles
import           System.Entropy
import           Web.ClientSession

import           Humblr.Database.Models
import           Humblr.Database.Queries

humblr :: Key -> Connection -> Application
humblr key conn = serveWithContext humblrAPI (genAuthServerContext key) (server key conn)

newtype FieldErrorT e m a = FieldErrorT { runFieldErrorT :: StateT (M.Map Text e) m a }
  deriving (Functor, Applicative, Monad, MonadIO)

fieldError :: (Monad m, ToJSON e) => Text -> e -> FieldErrorT e m ()
fieldError name val = FieldErrorT $ modify (M.insert name val)

whenSuccessful :: (Eq e, Monad m) => FieldErrorT e m a -> FieldErrorT e m ()
whenSuccessful (FieldErrorT m) = FieldErrorT $ do
  errs <- get
  when (errs == M.empty) $ void m

type FieldErrorHandler e = FieldErrorT e IO

fieldErrorsToHandler :: (Eq e, ToJSON e) => ServantErr -> (FieldErrorHandler e :~> Handler)
fieldErrorsToHandler err
  = Nat $ \m -> ExceptT $ do
      (res,errs) <- runStateT (runFieldErrorT m) M.empty
      if errs == M.empty
        then return $ Right res
        else return $ Left err { errBody = encodePretty $ object ["error" .= toJSON errs] }

newtype Token = Token { token :: Text }
  deriving (Eq, Generic, Show)

instance ToJSON Token where

type UserInfo = User' Int Text Text () ()
instance ToJSON UserInfo where
  toJSON user
    = object
      [ "id" .= (user ^. userId)
      , "username" .= (user ^. userName)
      , "email" .= (user ^. userEmail)
      ]

data RegistrationError
  = EmailExists
  | UsernameExists
  | PasswordTooShort
  deriving (Eq, Show)

instance ToJSON RegistrationError where
  toJSON EmailExists = toJSON ("That email is already taken" :: Text)
  toJSON UsernameExists = toJSON ("That username is already taken" :: Text)
  toJSON PasswordTooShort = toJSON ("Your password is too short" :: Text)

type RegisterUser = User' () Text Text Text ()
instance FromJSON RegisterUser where
  parseJSON (Object v)
    = User () <$>
      v .: "username" <*>
      v .: "email" <*>
      v .: "password" <*>
    pure ()
  parseJSON invalid = typeMismatch "RegisterUser" invalid

type LoginUser = User' () Text () Text ()
instance FromJSON LoginUser where
  parseJSON (Object v)
    = User () <$>
      v .: "username" <*>
      pure () <*>
      v .: "password" <*>
      pure ()
  parseJSON invalid = typeMismatch "LoginUser" invalid

type DisplayUser = User' Int Text () () ()
instance Serialize DisplayUser where
  put user = do
    B.put (user ^. userId)
    B.put $ encodeUtf8 (user ^. userName)

  get = User <$> B.get <*> (decodeUtf8 <$> B.get) <*> pure () <*> pure () <*> pure ()

instance ToJSON DisplayUser where
  toJSON user
    = object
      [ "id" .= (user ^. userId)
      , "username" .= (user ^. userName)
      ]

type Post = Post' Int Text UTCTime Text Text
instance ToJSON Post where
  toJSON post
    = object
      [ "id" .= (post ^. postId)
      , "author" .= (post ^. postUserId)
      , "created" .= (floor $ utcTimeToPOSIXSeconds (post ^. postCreated) :: Int)
      , "title" .= (post ^. postTitle)
      , "body" .= (post ^. postBody)
      ]

instance FromJSON Post where
  parseJSON (Object v)
    = Post <$>
      v .: "id" <*>
      v .: "author" <*>
      v .: "created" <*>
      v .: "title" <*>
      v .: "body"

type CreatePost = Post' () () () Text Text
instance FromJSON CreatePost where
    parseJSON (Object v) = Post () () () <$> v .: "title" <*> v .: "body"
    parseJSON invalid = typeMismatch "CreatePost" invalid

type MyPostsAPI
  = Get '[JSON] [Post] :<|>
    ReqBody '[JSON] CreatePost :> PostCreated '[JSON] ()

type PostAPI
  = Get '[JSON] Post :<|>
    AuthProtect "cookie-auth" :> Delete '[JSON] Text :<|>
    AuthProtect "cookie-auth" :> ReqBody '[JSON] CreatePost :> Patch '[JSON] Text

type HumblrAPI
  = "register" :> ReqBody '[JSON] RegisterUser :> PostCreated '[JSON] () :<|>
    "login" :> ReqBody '[JSON] LoginUser :> S.Post '[JSON] Token :<|>
    "user" :> Capture "user" Text :> "posts" :> Get '[JSON] [Post] :<|>
    "me" :> AuthProtect "cookie-auth" :> Get '[JSON] UserInfo :<|>
    "my" :> "posts" :> AuthProtect "cookie-auth" :> MyPostsAPI :<|>
    "users" :> Get '[JSON] [DisplayUser] :<|>
    "posts" :> Get '[JSON] [Post] :<|>
    "posts" :> Capture "postId" Int :> PostAPI :<|>
    Raw

humblrAPI :: Proxy HumblrAPI
humblrAPI = Proxy

genHash :: Text -> ByteString -> ByteString
genHash password = generate (Parameters (2^14) 8 1 100) (encodeUtf8 password)

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

data LoginError
  = UserDoesNotExist
  | PasswordIncorrect

showLoginError :: LoginError -> String
showLoginError UserDoesNotExist = "User does not exist"
showLoginError PasswordIncorrect = "Incorrect password"

instance ToJSON LoginError where
  toJSON e = object ["error" .= showLoginError e]

myPostsServer :: Key -> Connection -> DisplayUser -> Server MyPostsAPI
myPostsServer key conn user = myPosts :<|> createPost
  where
    myPosts :: Handler [Post]
    myPosts = do
      rows <- liftIO $ selectPostsForUser conn (user ^. userId)
      return $ fmap (postUserId .~ user ^. userName) rows

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
          | user ^. userName == post ^. postUserId -> do
              liftIO $ deletePost conn pid
              return "Post deleted"
          | otherwise -> throwError $ err401 { errBody = "You don't own that post" }

    updatePostEndpoint :: DisplayUser -> CreatePost -> Handler Text
    updatePostEndpoint user post = do
      maybePost <- liftIO $ selectPostById conn pid
      case maybePost of
        Nothing -> throwError $ err401 { errBody = "Post does not exist" }
        Just post'
          | user ^. userName == post' ^. postUserId -> do
              liftIO $ updatePost conn pid (post ^. postTitle) (post ^. postBody)
              return "Post updated"
          | otherwise -> throwError $ err401 { errBody = "You don't own that post" }

server :: Key -> Connection -> Server HumblrAPI
server key conn
  = enter (fieldErrorsToHandler err409) register :<|>
    login :<|>
    userPosts :<|>
    me :<|>
    myPostsServer key conn :<|>
    allUsers :<|>
    allPosts :<|>
    postServer key conn :<|>
    serveDirectory "dist"
  where
    usernameNotExists username = do
      exists <- liftIO $ usernameExists conn username
      when exists $ fieldError "username" UsernameExists
    emailNotExists email = do
      exists <- liftIO $ emailExists conn email
      when exists $ fieldError "email" EmailExists
    passwordCorrectLength password = when (T.length password < 8) $ fieldError "password" PasswordTooShort

    register :: RegisterUser -> FieldErrorHandler RegistrationError ()
    register user
      = let username = user ^. userName
            email = user ^. userEmail
            password = user ^. userPassword
        in do
          usernameNotExists username
          emailNotExists email
          passwordCorrectLength password
          whenSuccessful $ liftIO $ do
            salt <- getEntropy 100
            insertUser conn username email (genHash password salt) salt

    login :: LoginUser -> Handler Token
    login user
      = let username = user ^. userName
            password = user ^. userPassword
        in do
          maybeUser <- liftIO $ selectUserByUsername conn username
          case maybeUser of
            Nothing -> throwError $ err401 { errBody = encode UserDoesNotExist }
            Just userRow -> if genHash password (userRow ^. userSalt) /= userRow ^. userPassword
              then throwError $ err401 { errBody = encode PasswordIncorrect }
              else do
                t <- liftIO . encryptIO key $
                  B.encode (userRow &
                    userEmail .~ () &
                    userPassword .~ () &
                    userSalt .~ ())
                return (Token $ decodeUtf8 t)

    userPosts :: Text -> Handler [Post]
    userPosts username = do
      maybeUser <- liftIO $ selectUserByUsername conn username
      case maybeUser of
        Nothing -> throwError $ err401 { errBody = encode UserDoesNotExist }
        Just user -> do
          rows <- liftIO $ selectPostsForUser conn (user ^. userId)
          return $ fmap (postUserId .~ username) rows

    me :: DisplayUser -> Handler UserInfo
    me user = do
      maybeUser <- liftIO $ selectUserById conn (user ^. userId)
      case maybeUser of
        Nothing -> throwError $ err401 { errBody = encode UserDoesNotExist }
        Just userRow -> return (userRow & userPassword .~ () & userSalt .~ ())

    allUsers :: Handler [DisplayUser]
    allUsers = do
      rows <- liftIO $ selectUsers conn
      return $ fmap (set userEmail () . set userPassword () . set userSalt ()) rows

    allPosts :: Handler [Post]
    allPosts = liftIO $ selectPostsWithAuthors conn
