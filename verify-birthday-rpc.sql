-- RPC para verificar email + data de nascimento antes de recuperar senha
-- Retorna true se email existe e data_nascimento bate, false caso contrário
-- Não expõe dados do usuário

CREATE OR REPLACE FUNCTION verify_birthday(p_email TEXT, p_data_nascimento DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_dn DATE;
BEGIN
  -- Buscar user_id pelo email na tabela auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = lower(trim(p_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Buscar data_nascimento no profile
  SELECT data_nascimento INTO v_dn
  FROM profiles
  WHERE id = v_user_id;

  IF v_dn IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN v_dn = p_data_nascimento;
END;
$$;

-- Permitir chamada anonima (usuario nao esta logado ao recuperar senha)
GRANT EXECUTE ON FUNCTION verify_birthday(TEXT, DATE) TO anon;
GRANT EXECUTE ON FUNCTION verify_birthday(TEXT, DATE) TO authenticated;
