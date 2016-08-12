{-# language Arrows, FlexibleInstances, MultiParamTypeClasses, TemplateHaskell #-}

module Humblr.Database (
    User'(..)
    , Post'(..)
    , postQuery
    , postsForUser
    , userQuery
    , userToPostQuery
) where

import Control.Arrow (returnA)
import Data.Profunctor.Product (p2, p3, p4)
import Data.Profunctor.Product.TH (makeAdaptorAndInstance)
import Data.Text (Text)
import Opaleye

data User' a b c d = User { userId :: a, userName :: b, userPass :: c, userEmail :: d }
type User = User' Int Text Text Text
type UserColumn = User' (Column PGInt4) (Column PGText) (Column PGText) (Column PGText)
$(makeAdaptorAndInstance "pUser" ''User')

data Post' a b c = Post { postId :: a, postTitle :: b, postBody :: c }
type Post = Post' Int Text Text
type PostColumn = Post' (Column PGInt4) (Column PGText) (Column PGText)
$(makeAdaptorAndInstance "pPost" ''Post')

userTable :: Table UserColumn UserColumn
userTable = Table "users" $ pUser User {
    userId = required "id"
    , userName = required "username"
    , userPass = required "password"
    , userEmail = required "email"
    }

userQuery :: Query UserColumn
userQuery = queryTable userTable

userToPostTable :: Table (Column PGInt4, Column PGInt4) (Column PGInt4, Column PGInt4)
userToPostTable = Table "user_to_post" (p2 (required "user_id"
                                        , required "post_id"))

userToPostQuery :: Query (Column PGInt4, Column PGInt4)
userToPostQuery = queryTable userToPostTable

postTable :: Table PostColumn PostColumn
postTable = Table "posts" $ pPost Post {
    postId = required "id"
    , postTitle = required "title"
    , postBody = required "body"
    }

postQuery :: Query PostColumn
postQuery = queryTable postTable

postsForUser :: String -> Query PostColumn
postsForUser name = proc () -> do
    userRow <- userQuery -< ()
    (userId', postId') <- userToPostQuery -< ()
    postRow <- postQuery -< ()
   
    restrict -< pgString name .== userName userRow
    restrict -< userId userRow .== userId'
    restrict -< postId' .== postId postRow

    returnA -< postRow
