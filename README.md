# Wayfare Website Group Project

Wayfare is a static HTML/CSS/JavaScript group trip planner. The first backend step uses Supabase with shared trip links like `?trip=<trip_id>` and does not use Supabase login yet.

## Set up the Supabase database

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com/).
2. Sign in or create an account.
3. Click **New project**.
4. Choose an organization, enter a project name, create a database password, and choose a region.
5. Wait for Supabase to finish creating the project.

### 2. Open the SQL Editor

1. Open your Supabase project dashboard.
2. In the left sidebar, click **SQL Editor**.
3. Click **New query**.

### 3. Run the Wayfare schema

1. Open `supabase/schema.sql` in this repository.
2. Copy the full contents of the file.
3. Paste the SQL into the Supabase SQL Editor.
4. Click **Run**.
5. Confirm that the tables were created in the **Table Editor**.

The schema creates these tables:

- `trips`
- `trip_members`
- `proposals`
- `proposal_votes`
- `itinerary_items`
- `expenses`
- `expense_splits`

It also enables Row Level Security on every table and adds classroom MVP policies for shared-link access.

### 4. Use the publishable API key only

For the website, use only the Supabase **publishable** key, sometimes shown as the `anon` public key in Supabase examples.

You can find it in your Supabase dashboard:

1. Open your project.
2. Go to **Project Settings**.
3. Open **API**.
4. Copy the project URL and the publishable/anon public key.

### 5. Never use the secret/service role key in the website

Do **not** put the secret key or service role key in `index.html`, `app.js`, or any frontend file.

The service role key bypasses Row Level Security and is only for trusted server-side code. Wayfare is currently a static frontend website, so it should only use the publishable/anon key.

## Security note

The current Supabase policies are for a classroom MVP. They allow anyone with the publishable key and a shared trip link to create, read, update, and delete data. Before using this app publicly, add Supabase Auth and replace these open policies with user-based policies.
