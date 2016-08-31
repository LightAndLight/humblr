{-# language Arrows, FlexibleInstances, MultiParamTypeClasses, TemplateHaskell #-}

module Humblr.Database (
    User'(..)
    , userId
    , userName
    , userEmail
    , userPassword
    , userSalt

    , Post'(..)
    , postId
    , postUserId
    , postTitle
    , postBody

    , insertUser
    , insertPost
    , selectPosts
    , selectPostsForUser
    , selectUsers
    , selectUserById
    , selectUserByUsername
) where

import Control.Arrow (returnA)
import Control.Lens
import Data.ByteString (ByteString)
import Data.Int (Int64)
import Data.Profunctor.Product (p2, p3, p4)
import Data.Profunctor.Product.TH (makeAdaptorAndInstance)
import Data.Text (Text)
import Database.PostgreSQL.Simple (Connection)
import Opaleye
import Safe (headMay)


-- users
-- id | username | email | password_hash | salt
data User' a b c d e = User {
    _userId :: a
    , _userName :: b
    , _userEmail :: c
    , _userPassword :: d
    , _userSalt :: e
    }

type User = User' Int Text Text ByteString ByteString

makeLenses ''User'


type UserColumnR =
    User' (Column PGInt4) (Column PGText) (Column PGText) (Column PGBytea) (Column PGBytea)

type UserColumnW =
    User' (Maybe (Column PGInt4)) (Column PGText) (Column PGText) (Column PGBytea) (Column PGBytea)

$(makeAdaptorAndInstance "pUser" ''User')


-- posts
-- id | user_id | title | body
data Post' a b c d = Post {
    _postId :: a
    , _postUserId :: b
    , _postTitle :: c
    , _postBody :: d
    }

type Post = Post' Int Int Text Text

makeLenses ''Post'


type PostColumnR = Post' (Column PGInt4) (Column PGInt4) (Column PGText) (Column PGText)

type PostColumnW = Post' (Maybe (Column PGInt4)) (Column PGInt4) (Column PGText) (Column PGText)

$(makeAdaptorAndInstance "pPost" ''Post')


userTable :: Table UserColumnW UserColumnR
userTable = Table "users" $ pUser User {
    _userId = optional "id"
    , _userName = required "username"
    , _userEmail = required "email"
    , _userPassword = required "password_hash"
    , _userSalt = required "salt"
    }

userQuery :: Query UserColumnR
userQuery = queryTable userTable

selectUsers :: Connection -> IO [User]
selectUsers conn = runQuery conn userQuery

selectUserById :: Connection -> Int -> IO (Maybe User)
selectUserById conn uid = fmap headMay $ runQuery conn $ proc () -> do
    userRow <- userQuery -< ()
    restrict -< userRow ^. userId .== pgInt4 uid
    returnA -< userRow

selectUserByUsername :: Connection -> Text -> IO (Maybe User)
selectUserByUsername conn uname = fmap headMay $ runQuery conn $ proc () -> do
    userRow <- userQuery -< ()
    restrict -< userRow ^. userName .== pgStrictText uname
    returnA -< userRow

postTable :: Table PostColumnW PostColumnR
postTable = Table "posts" $ pPost Post {
    _postId = optional "id"
    , _postUserId = required "user_id"
    , _postTitle = required "title"
    , _postBody = required "body"
    }

postQuery :: Query PostColumnR
postQuery = queryTable postTable

selectPosts :: Connection -> IO [Post]
selectPosts conn = runQuery conn postQuery

postsForUserQuery :: Int -> Query PostColumnR
postsForUserQuery uid = proc () -> do
    postRow <- postQuery -< ()
    restrict -< pgInt4 uid .== postRow ^. postUserId
    returnA -< postRow

selectPostsForUser :: Connection -> Int -> IO [Post]
selectPostsForUser conn uid = runQuery conn $ postsForUserQuery uid

insertPost :: Connection -> Int -> Text -> Text -> IO Int
insertPost conn uid title body = fmap head $ runInsertReturning conn postTable newPost _postId
  where
    newPost = Post Nothing (pgInt4 uid) (pgStrictText title) (pgStrictText body)

insertUser :: Connection -> Text -> Text -> ByteString -> ByteString -> IO Int
insertUser conn username email passwordHash salt = fmap head $
    runInsertReturning conn userTable newUser _userId
  where
    newUser = User Nothing
        (pgStrictText username)
        (pgStrictText email)
        (pgStrictByteString passwordHash)
        (pgStrictByteString salt)
