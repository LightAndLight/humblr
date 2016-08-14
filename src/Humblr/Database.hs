{-# language Arrows, FlexibleInstances, MultiParamTypeClasses, TemplateHaskell #-}

module Humblr.Database (
    User'(..)
    , Post'(..)
    , insertUser
    , insertPost
    , selectPosts
    , selectPostsForUser
    , selectUsers
    , selectUserById
    , selectUserByUsername
) where

import Control.Arrow (returnA)
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
    , _userPasswordHash :: d
    , _userSalt :: e
    }

type User = User' Int Text Text ByteString ByteString

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

type PostColumnR = Post' (Column PGInt4) (Column PGInt4) (Column PGText) (Column PGText)

type PostColumnW = Post' (Maybe (Column PGInt4)) (Column PGInt4) (Column PGText) (Column PGText)

$(makeAdaptorAndInstance "pPost" ''Post')


userTable :: Table UserColumnW UserColumnR
userTable = Table "users" $ pUser User {
    _userId = optional "id"
    , _userName = required "username"
    , _userEmail = required "email"
    , _userPasswordHash = required "password_hash"
    , _userSalt = required "salt"
    }

userQuery :: Query UserColumnR
userQuery = queryTable userTable

selectUsers :: Connection -> IO [User]
selectUsers conn = runQuery conn userQuery

selectUserById :: Connection -> Int -> IO (Maybe User)
selectUserById conn userId = fmap headMay $ runQuery conn $ proc () -> do
    userRow <- userQuery -< ()
    restrict -< _userId userRow .== pgInt4 userId
    returnA -< userRow

selectUserByUsername :: Connection -> Text -> IO (Maybe User)
selectUserByUsername conn username = fmap headMay $ runQuery conn $ proc () -> do
    userRow <- userQuery -< ()
    restrict -< _userName userRow .== pgStrictText username
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
postsForUserQuery userId' = proc () -> do
    postRow <- postQuery -< ()
    restrict -< pgInt4 userId' .== _postUserId postRow
    returnA -< postRow

selectPostsForUser :: Connection -> Int -> IO [Post]
selectPostsForUser conn userId' = runQuery conn $ postsForUserQuery userId'

insertPost :: Connection -> Int -> Text -> Text -> IO Int
insertPost conn userId' title body = fmap head $ runInsertReturning conn postTable newPost _postId
  where
    newPost = Post Nothing (pgInt4 userId') (pgStrictText title) (pgStrictText body)

insertUser :: Connection -> Text -> Text -> ByteString -> ByteString -> IO Int
insertUser conn username email passwordHash salt = fmap head $
    runInsertReturning conn userTable newUser _userId
  where
    newUser = User Nothing
        (pgStrictText username)
        (pgStrictText email)
        (pgStrictByteString passwordHash)
        (pgStrictByteString salt)
