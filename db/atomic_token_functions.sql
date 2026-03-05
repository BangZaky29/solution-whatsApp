-- =====================================================
-- ATOMIC TOKEN OPERATIONS (Prevents Race Conditions)
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Atomic token deduction
-- Returns new balance if successful, -1 if insufficient
CREATE OR REPLACE FUNCTION deduct_tokens_atomic(
  p_user_id UUID,
  p_amount INT,
  p_type TEXT DEFAULT 'ai_response',
  p_description TEXT DEFAULT 'Deducted',
  p_reference_id TEXT DEFAULT NULL
)
RETURNS TABLE(new_balance INT, new_total_used INT) AS $$
DECLARE
  v_balance INT;
  v_total_used INT;
BEGIN
  -- Atomic update with check
  UPDATE token_balances
  SET 
    balance = balance - p_amount,
    total_used = total_used + p_amount,
    updated_at = now()
  WHERE user_id = p_user_id AND balance >= p_amount
  RETURNING balance, total_used INTO v_balance, v_total_used;

  -- If no row was updated (insufficient balance)
  IF NOT FOUND THEN
    RETURN QUERY SELECT -1::INT, -1::INT;
    RETURN;
  END IF;

  -- Log the transaction
  INSERT INTO token_transactions (user_id, amount, type, description, reference_id, balance_after)
  VALUES (p_user_id, -p_amount, p_type, p_description, p_reference_id, v_balance);

  RETURN QUERY SELECT v_balance, v_total_used;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atomic token credit
CREATE OR REPLACE FUNCTION credit_tokens_atomic(
  p_user_id UUID,
  p_amount INT,
  p_type TEXT DEFAULT 'subscription',
  p_description TEXT DEFAULT 'Credited',
  p_reference_id TEXT DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  v_balance INT;
BEGIN
  -- Upsert: create row if not exists, then credit
  INSERT INTO token_balances (user_id, balance, total_used)
  VALUES (p_user_id, p_amount, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET 
    balance = token_balances.balance + p_amount,
    updated_at = now()
  RETURNING balance INTO v_balance;

  -- Log the transaction
  INSERT INTO token_transactions (user_id, amount, type, description, reference_id, balance_after)
  VALUES (p_user_id, p_amount, p_type, p_description, p_reference_id, v_balance);

  RETURN v_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
