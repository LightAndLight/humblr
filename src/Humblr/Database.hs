module Humblr.Database where

import Data.Profunctor.Product (p2, p3, p4)
import Opaleye

userTable :: Table (Maybe (Column PGInt4), Column PGText, Column PGText, Column PGText)
                   (Column PGInt4, Column PGText, Column PGText, Column PGText)
userTable = Table "users" (p4 (optional "id"
                                 , required "username"
                                 , required "password"
                                 , required "email"))

userToPostTable :: Table (Column PGInt4, Column PGInt4)
                         (Column PGInt4, Column PGInt4)
userToPostTable = Table "userToPost" (p2 (required "userId"
                                        , required "postId"))

postTable :: Table (Maybe (Column PGInt4), Column PGText, Column PGText)
                   (Column PGInt4, Column PGText, Column PGText)
postTable = Table "posts" (p3 (optional "id"
                                 , required "title"
                                 , required "body"))
