import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const products=sqliteTable('products',{id:text('id').primaryKey(),kind:text('kind').notNull(),status:text('status').notNull(),data:text('data').notNull(),version:integer('version').notNull().default(1),updatedAt:text('updated_at').notNull(),updatedBy:text('updated_by').notNull()});
export const members=sqliteTable('members',{email:text('email').primaryKey(),userId:text('user_id').unique(),role:text('role').notNull()});
export const assets=sqliteTable('assets',{id:text('id').primaryKey(),kind:text('kind').notNull(),mime:text('mime').notNull(),name:text('name').notNull(),size:integer('size').notNull(),createdBy:text('created_by').notNull()});
export const settings=sqliteTable('settings',{id:text('id').primaryKey(),data:text('data').notNull(),version:integer('version').notNull().default(1)});
