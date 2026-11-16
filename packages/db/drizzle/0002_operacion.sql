CREATE TYPE "public"."guardian_role" AS ENUM('OWNER', 'AUTHORIZED');--> statement-breakpoint
CREATE TYPE "public"."modality" AS ENUM('CENTER', 'HOME', 'ONLINE', 'GROUP');--> statement-breakpoint
CREATE TYPE "public"."package_movement_kind" AS ENUM('PURCHASE', 'CONSUME', 'REVERSE', 'ADJUST', 'EXPIRE');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'TRANSFER', 'CARD', 'WALLET', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."pet_sex" AS ENUM('MALE', 'FEMALE');--> statement-breakpoint
CREATE TYPE "public"."pet_size" AS ENUM('S', 'M', 'L', 'XL');--> statement-breakpoint
CREATE TYPE "public"."program_status" AS ENUM('PENDING', 'ACTIVE', 'PAUSED', 'FINISHED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('SCHEDULED', 'CONFIRMED', 'DONE', 'CANCELLED', 'NO_SHOW');--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"trainer_id" uuid NOT NULL,
	"assessed_at" date DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"owner_goals" text,
	"obedience" text,
	"socialization" text,
	"home_behavior" text,
	"public_behavior" text,
	"strangers" text,
	"other_dogs" text,
	"anxiety" integer,
	"unwanted_behaviors" text,
	"background" text,
	"observations" text,
	"recommendations" text,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"program_id" uuid,
	"concept" text NOT NULL,
	"amount" integer NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"due_date" date NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "counters_organization_id_key_pk" PRIMARY KEY("organization_id","key")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"amount" integer NOT NULL,
	"spent_at" date NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"session_id" uuid,
	"title" text NOT NULL,
	"detail" text,
	"frequency" text,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"kind" "package_movement_kind" NOT NULL,
	"delta" integer NOT NULL,
	"session_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid_at" date NOT NULL,
	"reference" text,
	"receipt_number" integer NOT NULL,
	"notes" text,
	"voided" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"role" "guardian_role" DEFAULT 'OWNER' NOT NULL,
	"can_pick_up" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"species" text DEFAULT 'Perro' NOT NULL,
	"breed" text,
	"sex" "pet_sex",
	"birth_date" date,
	"weight_kg" text,
	"size" "pet_size",
	"color" text,
	"joined_at" date DEFAULT now() NOT NULL,
	"photo_key" text,
	"alerts" text[] DEFAULT '{}'::text[] NOT NULL,
	"health" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"behavior" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"trainer_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"expires_at" date,
	"goals" text,
	"sessions_contracted" integer NOT NULL,
	"price" integer NOT NULL,
	"status" "program_status" DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"price" integer NOT NULL,
	"sessions_count" integer DEFAULT 1 NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"modality" "modality" DEFAULT 'CENTER' NOT NULL,
	"validity_days" integer,
	"conditions" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"value" integer NOT NULL,
	"assessment_id" uuid,
	"session_id" uuid,
	"rated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_off" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"program_id" uuid,
	"trainer_id" uuid NOT NULL,
	"branch_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"modality" "modality" DEFAULT 'CENTER' NOT NULL,
	"location" text,
	"status" "session_status" DEFAULT 'SCHEDULED' NOT NULL,
	"notes" text,
	"cancel_reason" text,
	"objectives" text,
	"exercises" text,
	"commands" text[] DEFAULT '{}'::text[] NOT NULL,
	"results" text,
	"difficulties" text,
	"behavior" text,
	"response_level" integer,
	"internal_notes" text,
	"next_goals" text,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "working_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "no_show_consumes" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "cancel_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counters" ADD CONSTRAINT "counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_tasks" ADD CONSTRAINT "home_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_tasks" ADD CONSTRAINT "home_tasks_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_tasks" ADD CONSTRAINT "home_tasks_session_id_training_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_ledger" ADD CONSTRAINT "package_ledger_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_ledger" ADD CONSTRAINT "package_ledger_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_guardians" ADD CONSTRAINT "pet_guardians_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_guardians" ADD CONSTRAINT "pet_guardians_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_guardians" ADD CONSTRAINT "pet_guardians_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_ratings" ADD CONSTRAINT "skill_ratings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_ratings" ADD CONSTRAINT "skill_ratings_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_ratings" ADD CONSTRAINT "skill_ratings_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_ratings" ADD CONSTRAINT "skill_ratings_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessments_pet_idx" ON "assessments" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "charges_client_idx" ON "charges" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "charges_org_due_idx" ON "charges" USING btree ("organization_id","due_date");--> statement-breakpoint
CREATE INDEX "home_tasks_pet_idx" ON "home_tasks" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "package_ledger_program_idx" ON "package_ledger" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "allocations_charge_idx" ON "payment_allocations" USING btree ("charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_receipt_uq" ON "payments" USING btree ("organization_id","receipt_number");--> statement-breakpoint
CREATE INDEX "payments_org_date_idx" ON "payments" USING btree ("organization_id","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pet_guardians_uq" ON "pet_guardians" USING btree ("pet_id","client_id");--> statement-breakpoint
CREATE INDEX "pet_guardians_client_idx" ON "pet_guardians" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "pets_org_name_idx" ON "pets" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "programs_pet_idx" ON "programs" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "programs_trainer_idx" ON "programs" USING btree ("organization_id","trainer_id","status");--> statement-breakpoint
CREATE INDEX "skill_ratings_pet_idx" ON "skill_ratings" USING btree ("pet_id","skill_id","rated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_org_name_uq" ON "skills" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "sessions_org_start_idx" ON "training_sessions" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "sessions_trainer_idx" ON "training_sessions" USING btree ("trainer_id","starts_at");--> statement-breakpoint
CREATE INDEX "sessions_pet_idx" ON "training_sessions" USING btree ("pet_id","starts_at");