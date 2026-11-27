-- Les clés d'indexation fractionnaire se comparent octet par octet : collation "C".
ALTER TABLE "sections" ALTER COLUMN "sort_key" TYPE text COLLATE "C";--> statement-breakpoint
ALTER TABLE "task_projects" ALTER COLUMN "sort_key" TYPE text COLLATE "C";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "subtask_sort_key" TYPE text COLLATE "C";
