import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { toCamelCase } from '@/lib/supabase-helpers';
import { PRODUCT_FINANCIAL_SELECT } from '@/lib/smart-hpp';

// TEMPORARY debug endpoint — remove after fixing
export async function GET() {
  const results: Record<string, any> = {};

  // Test 1: Fetch products with financial select
  try {
    const { data, error } = await db.from('products').select(PRODUCT_FINANCIAL_SELECT).limit(2);
    results.test1_products = { success: !error, error: error?.message, count: data?.length };
    if (data?.[0]) {
      results.test1_firstProduct = {
        id: data[0].id,
        name: data[0].name,
        has_conversion_rate: 'conversion_rate' in data[0],
        has_sub_unit: 'sub_unit' in data[0],
        conversion_rate: data[0].conversion_rate,
        sub_unit: data[0].sub_unit,
        camel: toCamelCase(data[0])
      };
    }
  } catch (e: any) {
    results.test1_products = { success: false, error: e.message };
  }

  // Test 2: Test transaction join with products
  try {
    const { data, error } = await db.from('transactions').select('*, items:transaction_items(*, product:products(unit, sub_unit, conversion_rate))').limit(1);
    results.test2_transaction_join = { success: !error, error: error?.message, count: data?.length };
  } catch (e: any) {
    results.test2_transaction_join = { success: false, error: e.message };
  }

  // Test 3: Check smart-hpp conversion
  try {
    const { data: products } = await db.from('products').select(PRODUCT_FINANCIAL_SELECT).limit(1);
    if (products?.[0]) {
      const p = toCamelCase(products[0]);
      results.test3_smarthpp = {
        conversionRate: p.conversionRate,
        subUnit: p.subUnit,
        hasConversionRate: 'conversionRate' in p,
        hasSubUnit: 'subUnit' in p,
      };
    }
  } catch (e: any) {
    results.test3_smarthpp = { success: false, error: e.message };
  }

  return NextResponse.json(results);
}
