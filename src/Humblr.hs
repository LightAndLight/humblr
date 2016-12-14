{-# LANGUAGE ConstraintKinds         #-}
{-# LANGUAGE DataKinds         #-}
{-# LANGUAGE DeriveGeneric     #-}
{-# LANGUAGE FlexibleInstances #-}
{-# LANGUAGE OverloadedLabels #-}
{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE TypeFamilies      #-}
{-# LANGUAGE TypeOperators     #-}

module Humblr (humblr) where

import Bookkeeper ((:=>), Book, emptyBook)
import           Control.Lens                     (mapped, over, set, (&), (.~),
                                                   (^.))
import           Control.Monad.IO.Class           (liftIO)
import           Crypto.KDF.Scrypt
import           Data.Aeson
import           Data.Aeson.Types                 (typeMismatch)
import           Data.ByteString                  (ByteString)
import           Data.ByteString.Char8            (pack)
import           Data.Maybe                       (fromJust)
import           Data.Serialize                   (Serialize, get, put)
import qualified Data.Serialize                   as B
import           Data.Text                        (Text)
import           Data.Text.Encoding               (decodeUtf8, encodeUtf8)
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

import           Humblr.Database

humblr :: Key -> Connection -> Application
humblr key conn = serveWithContext humblrAPI (genAuthServerContext key) (server key conn)

newtype Token = Token { token :: Text }
  deriving (Eq, Generic, Show)

instance ToJSON Token where

type UserInfo = Book '["id" :=> Int, "username" :=> Text, "email" :=> Text]
instance ToJSON UserInfo where
    toJSON rec = object [
        "id" .= (rec ?: #id)
        , "username" .= (rec ?: #username)
        , "email" .= (rec ?: #email)
        ]

type RegisterUser = Book '["username" :=> Text, "email" :=> Text, "password" :=> Text]
instance FromJSON RegisterUser where
    parseJSON (Object v)
      = (set #userName <$> v .: "username") <*>
        ((set #email <$> v .: "email") <*>
        ((flip (set #password) emptyBook <$> v .: "password")))
    parseJSON invalid = typeMismatch "RegisterUser" invalid

type LoginUser = Book '["username" :=> Text, "password" :=> Text]
instance FromJSON LoginUser where
    parseJSON (Object v)
      = (set #userName <$> v .: "username") <*>
        (flip (set #password) emptyBook <$> v .: "password")
    parseJSON invalid = typeMismatch "LoginUser" invalid

type DisplayUser = Book '["id" :=> Int, "username" :=> Text]
instance Serialize DisplayUser where
    put user = do
        put (user ?: #id)
        put $ encodeUtf8 (user ?: #username)

    get
      = (set #id <$> get) <*>
      (flip (set #username) emptyBook . decodeUtf8 <$> get)

instance ToJSON DisplayUser where
    toJSON rec = object [
        "id" .= (rec ?: #id)
        , "username" .= (rec ?: #username)
        ]

type Post = Book '["id" :=> Int, "author" :=> Text, "title" :=> Text, "body" :=> Text]
instance ToJSON Post where
    toJSON rec = object [
        "id" .= (rec ?: #id)
        , "author" .= (rec ?: #author)
        , "title" .= (rec ?: #title)
        , "body" .= (rec ?: #body)
        ]

instance FromJSON Post where
    parseJSON (Object v)
      = (set #id <$> v .: "id") <*>
        ((set #author <$> v .: "author") <*>
        ((set #title <$> v .: "title") <*>
        ((flip (set #body) emptyBook <$> v .: "body"))))

type CreatePost = Post' () () Text Text
instance FromJSON CreatePost where
    parseJSON (Object v) = Post () () <$>
        v .: "title" <*>
        v .: "body"
    parseJSON invalid = typeMismatch "CreatePost" invalid

type MyPostsAPI = Get '[JSON] [Post]
            :<|> "add" :> ReqBody '[JSON] CreatePost :> S.Post '[JSON] Text

type PostAPI = Get '[JSON] Post
          :<|> "delete" :> AuthProtect "cookie-auth" :> Delete '[JSON] Text
          :<|> "update" :> AuthProtect "cookie-auth"
               :> ReqBody '[JSON] CreatePost :> Patch '[JSON] Text

type HumblrAPI = "register" :> ReqBody '[JSON] RegisterUser :> S.Post '[JSON] Text
            :<|> "login" :> ReqBody '[JSON] LoginUser :> S.Post '[JSON] Token
            :<|> "user" :> Capture "user" Text :> "posts" :> Get '[JSON] [Post]
            :<|> "me" :> AuthProtect "cookie-auth" :> Get '[JSON] UserInfo
            :<|> "my" :> "posts" :> AuthProtect "cookie-auth" :> MyPostsAPI
            :<|> "users" :> Get '[JSON] [DisplayUser]
            :<|> "posts" :> Get '[JSON] [Post]
            :<|> "posts" :> Capture "postId" Int :> PostAPI
            :<|> Raw

humblrAPI :: Proxy HumblrAPI
humblrAPI = Proxy

genHash :: Text -> ByteString -> ByteString
genHash password = generate (Parameters 1024 42 42 100) (encodeUtf8 password)

authHandler :: Key -> AuthHandler Request DisplayUser
authHandler key = mkAuthHandler $ \req -> case lookup "auth" (requestHeaders req) of
    Nothing -> throwError $ err401 { errBody = "Missing auth header" }
    Just cookie -> case decrypt key cookie of
        Nothing -> throwError $ err403 { errBody = "Invalid cookie" }
        Just serialized -> case B.decode serialized of
            Left _ -> throwError $ err403 { errBody = "Invalid cookie" }
            Right user -> return user

type instance AuthServerData (AuthProtect "cookie-auth") = DisplayUser

genAuthServerContext :: Key -> Context (AuthHandler Request DisplayUser ': '[])
genAuthServerContext key = authHandler key :. EmptyContext

data LoginError = UserDoesNotExist
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

    createPost :: CreatePost -> Handler Text
    createPost post = do
        liftIO $ insertPost conn (user ^. userId) (post ^. postTitle) (post ^. postBody)
        return "post created"

postServer :: Key -> Connection -> Int -> Server PostAPI
postServer key conn pid = postWithId :<|> deletePostEndpoint :<|> updatePostEndpoint
  where
    postWithId :: Handler Post
    postWithId = do
        maybePost <- liftIO $ selectPostWithId conn pid
        case maybePost of
            Nothing -> throwError $ err401 { errBody = "Post does not exist" }
            Just (post,username) -> return (post & postUserId .~ username)

    deletePostEndpoint :: DisplayUser -> Handler Text
    deletePostEndpoint user = do
        maybePost <- liftIO $ selectPostWithId conn pid
        case maybePost of
            Nothing -> throwError $ err401 { errBody = "Post does not exist" }
            Just (post,username)
              | user ^. userId == post ^. postUserId -> do
                liftIO $ deletePost conn pid
                return "Post deleted"
              | otherwise -> throwError $ err401 { errBody = "You don't own that post" }

    updatePostEndpoint :: DisplayUser -> CreatePost -> Handler Text
    updatePostEndpoint user post = do
        maybePost <- liftIO $ selectPostWithId conn pid
        case maybePost of
            Nothing -> throwError $ err401 { errBody = "Post does not exist" }
            Just (post',username)
              | user ^. userId == post' ^. postUserId -> do
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
    serveDirectory "dist"
  where
    register :: RegisterUser -> Handler Text
    register user = do
        let username = user ^. userName
            email = user ^. userEmail
            password = user ^. userPassword
        maybeUser <- liftIO $ selectUserByUsername conn username
        case maybeUser of
            Just _ -> throwError $ err401 { errBody = "User already exists" }
            Nothing -> do
                salt <- liftIO $ getEntropy 100
                liftIO $ insertUser conn username email (genHash password salt) salt
                return "User created"

    login :: LoginUser -> Handler Token
    login user = do
        let username = user ^. userName
            password = user ^. userPassword
        maybeUser <- liftIO $ selectUserByUsername conn username
        case maybeUser of
            Nothing -> throwError $ err401 { errBody = encode UserDoesNotExist }
            Just userRow -> if genHash password (userRow ^. userSalt) /= userRow ^. userPassword
                then throwError $ err401 { errBody = encode PasswordIncorrect }
                else do
                    t <- liftIO . encryptIO key $
                        B.encode
                            (userRow & set userEmail () . set userPassword () . set userSalt ())
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
            Just userRow -> return (userRow & set userPassword () . set userSalt ())


    allUsers :: Handler [DisplayUser]
    allUsers = do
        rows <- liftIO $ selectUsers conn
        return $ fmap (set userEmail () . set userPassword () . set userSalt ()) rows

    allPosts :: Handler [Post]
    allPosts = do
        res <- liftIO $ selectPostsWithAuthors conn
        return $ fmap (\(post,username) -> post & postUserId .~ username ) res
