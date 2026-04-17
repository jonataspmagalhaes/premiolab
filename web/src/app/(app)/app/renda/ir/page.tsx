// Redirect pra nova tela IR — o conteudo migrou para /app/ir/rendimentos
// com modo Contador completo. Mantido aqui apenas pra preservar bookmarks.

import { redirect } from 'next/navigation';

export default function RelatorioIRLegacyRedirect() {
  redirect('/app/ir/rendimentos');
}
