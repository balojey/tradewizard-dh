#!/usr/bin/env tsx
/**
 * delete-markets.ts
 *
 * Removes specific markets (by condition_id) and all their related rows
 * from the database via CASCADE (recommendations, agent_signals,
 * analysis_history, recommendation_outcomes, recommendation_grades).
 *
 * Usage:
 *   npx tsx scripts/delete-markets.ts
 *   # or with custom condition IDs:
 *   CONDITION_IDS="0xabc,0xdef" npx tsx scripts/delete-markets.ts
 */

import 'dotenv/config';
import { createSupabaseClientManager } from '../src/database/supabase-client.js';

const CONDITION_IDS: string[] = [
  '0x40d43b6adbf0285dad35dc5cfa597c23882e5631e8212c899634be64728fd698',
  '0x347f9cfc75ec810ccb80bfde9b61cee2dca697371510fc3e6b99ce315e4cb81e',
  '0x47e3bb0616a698b284145759f805bea5c760acf889e66da0506937698b417c95',
  '0xdaf1d8c57e042ae7466dc45b22466cdc91e4e4f5980652f7f80aa154366c01c7',
  '0x9cd7210758037689b868fde00eb1ce5bec345d2336361ddce9bd3d84de30f0ce',
  '0xcef6eb62edc0fdc47f90a7e8ed8dbb17194efc01dc7ae9cd0837e66d71b8900e',
  '0x125466a1d45ae996569106ee1d4f804bc3de7bea9b244bc756e5f41e88d6d6d5',
  '0x07d45de444dbe0595c068a9eade49ace2bd381e30d6a45022d801ec10e7d0294',
  '0x561cd8d035bac38ed04e23d7882a126da38d7ead9d6679f722ad62c0c9d54ad2',
  '0x777809ed6f165bae0a60cc94957299627fa2ac4a5e9815e13cd02384ebc46490',
  '0xa6880c17f894783ba6140debfe730805b210ca2c587b265d35ef7976ebea1788',
  '0x23182cf066e5f6e63579c6928ee496f24b19cf2ac9da701b2539fe7e220e05bd',
  '0xa3b07c4fa6ef6bcea9be5d3210f2e58913929515421fbf96f5b9123ce6a9acdc',
  '0xdaecc996ed92b217159ed2cbb6d8b880a1dfd53298a90cd42a3003176794ac3a',
  '0xbe6525eb1b615ba8a490abc915d76cdffabb2aad4f71e26aaee5f57c3b096a71',
  '0x47a6e502ccd9fab12e42e4d22d18d561d329e49870a0b0038edd1c7b39d8fa92',
  '0x0e1a1094091ba8905a5d11222796cf94d3d6d055076f0088886bd2386e6f88b8'
]

async function main() {
  const conditionIds = process.env.CONDITION_IDS
    ? process.env.CONDITION_IDS.split(',').map((s) => s.trim())
    : CONDITION_IDS;

  console.log(`\nDeleting ${conditionIds.length} markets...\n`);

  const manager = createSupabaseClientManager();
  await manager.connect();
  const supabase = manager.getClient();

  // Fetch the markets first so we can report what's being deleted
  const { data: found, error: fetchError } = await supabase
    .from('markets')
    .select('id, condition_id, question, status')
    .in('condition_id', conditionIds);

  if (fetchError) {
    console.error('Failed to fetch markets:', fetchError.message);
    process.exit(1);
  }

  if (!found || found.length === 0) {
    console.log('No matching markets found in the database.');
    await manager.disconnect();
    return;
  }

  console.log(`Found ${found.length} market(s) to delete:`);
  for (const m of found) {
    console.log(`  [${m.status}] ${m.condition_id} — ${m.question}`);
  }

  const missing = conditionIds.filter((id) => !found.some((m) => m.condition_id === id));
  if (missing.length > 0) {
    console.log(`\nNot found in DB (skipping):`);
    missing.forEach((id) => console.log(`  ${id}`));
  }

  // Confirm before deleting
  if (process.env.DRY_RUN === 'true') {
    console.log('\nDry run — no rows deleted.');
    await manager.disconnect();
    return;
  }

  // Delete — CASCADE handles all related rows automatically
  const { error: deleteError, count } = await supabase
    .from('markets')
    .delete({ count: 'exact' })
    .in('condition_id', conditionIds);

  if (deleteError) {
    console.error('\nDeletion failed:', deleteError.message);
    process.exit(1);
  }

  console.log(`\nDeleted ${count} market(s) and all related rows (CASCADE).`);
  await manager.disconnect();
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
