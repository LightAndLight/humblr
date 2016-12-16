initdb -D .pgsql/data &&
pg_ctl -D .pgsql/data -l logfile start
createdb humblrdb &&
psql -d humblrdb -a -f schema.sql
