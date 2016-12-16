{-# LANGUAGE FlexibleInstances     #-}
{-# LANGUAGE MultiParamTypeClasses #-}
{-# LANGUAGE TemplateHaskell       #-}

module Humblr.Database.Models
  ( User'(..)
  , UserColumnR
  , UserColumnW
  , userTable
  , userId
  , userName
  , userEmail
  , userPassword
  , userSalt

  , Post'(..)
  , PostColumnR
  , PostColumnW
  , postTable
  , postId
  , postAuthor
  , postCreated
  , postTitle
  , postBody
) where

import           Control.Lens               (makeLenses)
import           Data.ByteString            (ByteString)
import           Data.Profunctor.Product.TH (makeAdaptorAndInstance)
import           Data.Text                  (Text)
import           Opaleye

-- users
-- id | username | email | password_hash | salt
data User' a b c d e
  = User
    { _userId       :: a
    , _userName     :: b
    , _userEmail    :: c
    , _userPassword :: d
    , _userSalt     :: e
    }

makeLenses ''User'

type UserColumnR
  = User'
    (Column PGInt4)
    (Column PGText)
    (Column PGText)
    (Column PGBytea)
    (Column PGBytea)

type UserColumnW
  = User'
    (Maybe (Column PGInt4))
    (Column PGText)
    (Column PGText)
    (Column PGBytea)
    (Column PGBytea)

$(makeAdaptorAndInstance "pUser" ''User')

userTable :: Table UserColumnW UserColumnR
userTable = Table "users" $
  pUser User
    { _userId = optional "id"
    , _userName = required "username"
    , _userEmail = required "email"
    , _userPassword = required "password_hash"
    , _userSalt = required "salt"
    }

-- posts
-- id | user_id | time_created | title | body
data Post' a b c d e
  = Post
    { _postId      :: a
    , _postAuthor  :: b
    , _postCreated :: c
    , _postTitle   :: d
    , _postBody    :: e
    }

makeLenses ''Post'

type PostColumnR
  = Post'
    (Column PGInt4)
    (Column PGInt4)
    (Column PGTimestamptz)
    (Column PGText)
    (Column PGText)

type PostColumnW
  = Post'
    (Maybe (Column PGInt4))
    (Column PGInt4)
    (Maybe (Column PGTimestamptz))
    (Column PGText)
    (Column PGText)

$(makeAdaptorAndInstance "pPost" ''Post')

postTable :: Table PostColumnW PostColumnR
postTable = Table "posts" $
  pPost Post
    { _postId = optional "id"
    , _postAuthor = required "user_id"
    , _postCreated = optional "created"
    , _postTitle = required "title"
    , _postBody = required "body"
    }
