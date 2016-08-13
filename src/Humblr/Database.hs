{-# language Arrows, FlexibleInstances, MultiParamTypeClasses, TemplateHaskell #-}

module Humblr.Database (
    User'(..)
    , Post'(..)
    , insertUser
    , insertPost
    , insertPostForUser
    , selectPosts
    , selectPostsForUser
    , selectUsers
) where

import Control.Arrow (returnA)
import Data.Int (Int64)
import Database.PostgreSQL.Simple (Connection)
import Data.Profunctor.Product (p2, p3, p4)
import Data.Profunctor.Product.TH (makeAdaptorAndInstance)
import Data.Text (Text)
import Opaleye

data User' a b c d = User { userId :: a, userName :: b, userPass :: c, userEmail :: d }
type User = User' Int Text Text Text
type UserColumnR = User' (Column PGInt4) (Column PGText) (Column PGText) (Column PGText)
type UserColumnW = User' (Maybe (Column PGInt4)) (Column PGText) (Column PGText) (Column PGText)
$(makeAdaptorAndInstance "pUser" ''User')

data Post' a b c = Post { postId :: a, postTitle :: b, postBody :: c }
type Post = Post' Int Text Text
type PostColumnR = Post' (Column PGInt4) (Column PGText) (Column PGText)
type PostColumnW = Post' (Maybe (Column PGInt4)) (Column PGText) (Column PGText)
$(makeAdaptorAndInstance "pPost" ''Post')

userTable :: Table UserColumnW UserColumnR
userTable = Table "users" $ pUser User {
    userId = optional "id"
    , userName = required "username"
    , userPass = required "password"
    , userEmail = required "email"
    }

userQuery :: Query UserColumnR
userQuery = queryTable userTable

selectUsers :: Connection -> IO [User' Int Text Text Text]
selectUsers conn = runQuery conn userQuery

userToPostTable :: Table (Column PGInt4, Column PGInt4) (Column PGInt4, Column PGInt4)
userToPostTable = Table "user_to_post" (p2 (required "user_id"
                                        , required "post_id"))

userToPostQuery :: Query (Column PGInt4, Column PGInt4)
userToPostQuery = queryTable userToPostTable

postTable :: Table PostColumnW PostColumnR
postTable = Table "posts" $ pPost Post {
    postId = optional "id"
    , postTitle = required "title"
    , postBody = required "body"
    }

postQuery :: Query PostColumnR
postQuery = queryTable postTable

selectPosts :: Connection -> IO [Post' Int Text Text]
selectPosts conn = runQuery conn postQuery

postsForUserQuery :: Int -> Query PostColumnR
postsForUserQuery userId'' = proc () -> do
    (userId', postId') <- userToPostQuery -< ()
    postRow <- postQuery -< ()
   
    restrict -< pgInt4 userId'' .== userId'
    restrict -< postId' .== postId postRow

    returnA -< postRow

selectPostsForUser :: Connection -> Int -> IO [Post' Int Text Text]
selectPostsForUser conn userId' = runQuery conn $ postsForUserQuery userId'

insertPost :: Connection -> Text -> Text -> IO Int
insertPost conn title body = fmap head $ runInsertReturning conn postTable
    (Post Nothing (pgStrictText title) (pgStrictText body)) postId

insertUser :: Connection -> Text -> Text -> Text -> IO Int
insertUser conn username password email = fmap head $ runInsertReturning conn userTable
    (User Nothing (pgStrictText username) (pgStrictText password) (pgStrictText email)) userId

insertPostForUser :: Connection -> Int -> Text -> Text -> IO Int64
insertPostForUser conn userId' title body = do
    postId' <- insertPost conn title body
    runInsert conn userToPostTable (pgInt4 userId', pgInt4 postId')
