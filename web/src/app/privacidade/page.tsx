import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Política de Privacidade — PremioLab',
  description: 'Como o PremioLab coleta, usa e protege seus dados.',
};

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen">
      <Header />

      <article className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="font-display font-extrabold text-4xl md:text-5xl mb-2">
          Política de Privacidade
        </h1>
        <p className="text-sm text-muted mb-12">Última atualização: 10 de abril de 2026</p>

        <p className="text-secondary leading-relaxed mb-8">
          O PremioLab (&quot;nós&quot;, &quot;nosso&quot; ou &quot;app&quot;) respeita sua privacidade.
          Esta política explica quais dados coletamos, como os usamos e como os protegemos.
        </p>

        <Section title="1. Dados que Coletamos">
          <P>
            <strong>Dados de conta:</strong> ao se registrar, coletamos nome, e-mail, senha
            (hash criptográfico), país, cidade, data de nascimento e sexo. Esses dados são
            necessários para criar e gerenciar sua conta.
          </P>
          <P>
            <strong>Dados financeiros:</strong> operações de compra e venda, posições em opções,
            renda fixa, proventos, saldos de corretora, cartões de crédito, movimentações
            financeiras, orçamentos e transações recorrentes. Todos esses dados são inseridos
            voluntariamente por você e armazenados de forma segura.
          </P>
          <P>
            <strong>Dados de uso:</strong> informações sobre como você interage com o app,
            incluindo telas visitadas, features utilizadas e timestamps de acesso. Não rastreamos
            sua localização.
          </P>
          <P>
            <strong>Dados de dispositivo:</strong> identificador único de instalação (UUID
            anônimo), plataforma (iOS/Android/Web), token de push notification. Usados para
            funcionalidades do app e prevenção de fraude.
          </P>
        </Section>

        <Section title="2. Como Usamos seus Dados">
          <UL items={[
            'Funcionalidades do app: exibir sua carteira, calcular indicadores, gerar relatórios, sincronizar proventos automaticamente.',
            'Inteligência Artificial: quando você solicita uma análise IA, seus dados de portfólio são enviados de forma segura para o modelo Claude (Anthropic) via nossa Edge Function. Nenhum dado é armazenado pela Anthropic.',
            'Notificações: enviamos push notifications sobre vencimentos de opções, alertas de preço e resumos da carteira, conforme suas preferências.',
            'Backup: realizamos backups automáticos diários dos seus dados com retenção de 30 dias para proteção contra perda acidental.',
            'Melhoria do serviço: dados agregados e anonimizados podem ser usados para melhorar o app.',
          ]} />
        </Section>

        <Section title="3. Compartilhamento de Dados">
          <P>
            Não vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros para fins
            de marketing. Seus dados podem ser compartilhados apenas com:
          </P>
          <UL items={[
            'Supabase: nosso provedor de banco de dados e autenticação (PostgreSQL com Row Level Security).',
            'Anthropic (Claude): quando você solicita análises IA, dados do portfólio são processados via API segura.',
            'StatusInvest: consultamos cotações, dividendos e dados fundamentalistas de FIIs e ações brasileiras. Apenas tickers são enviados.',
            'Yahoo Finance: consultamos cotações de ativos internacionais. Apenas tickers são enviados.',
            'Kiwify: gerenciamento de pagamentos e assinaturas. Recebem nome, e-mail e dados de pagamento que você fornece no checkout.',
            'Expo (Expo Push API): envio de notificações push.',
          ]} />
        </Section>

        <Section title="4. Segurança">
          <P>Adotamos medidas de segurança para proteger seus dados:</P>
          <UL items={[
            'Autenticação via Supabase Auth com senhas em hash criptográfico.',
            'Row Level Security (RLS) em todas as tabelas — cada usuário só acessa seus próprios dados.',
            'Comunicação via HTTPS/TLS em todas as requisições.',
            'Chaves de API armazenadas como secrets no servidor (nunca expostas ao client).',
            'Backups criptografados com retenção limitada (30 dias).',
          ]} />
        </Section>

        <Section title="5. Seus Direitos">
          <P>Você pode, a qualquer momento:</P>
          <UL items={[
            'Acessar seus dados através do app (tela de perfil, backup).',
            'Corrigir seus dados pessoais na tela de perfil.',
            'Exportar seus dados em formato CSV através dos relatórios.',
            'Excluir sua conta e todos os dados associados entrando em contato conosco.',
          ]} />
          <P>
            Para exercer qualquer desses direitos, entre em contato pelo e-mail{' '}
            <a href="mailto:contato@premiolab.com.br" className="text-income hover:underline">
              contato@premiolab.com.br
            </a>.
          </P>
        </Section>

        <Section title="6. Retenção de Dados">
          <P>
            Seus dados são mantidos enquanto sua conta estiver ativa. Ao solicitar a exclusão da
            conta, todos os dados são removidos permanentemente em até 30 dias.
          </P>
          <P>
            Backups automáticos são retidos por no máximo 30 dias e apagados automaticamente após
            esse período.
          </P>
        </Section>

        <Section title="7. Cookies e Rastreamento">
          <P>
            O site PremioLab usa apenas cookies essenciais para autenticação (sessão do Supabase).
            Não integramos ferramentas de rastreamento de terceiros (como Google Analytics ou
            Facebook Pixel).
          </P>
        </Section>

        <Section title="8. Menores de Idade">
          <P>
            O PremioLab não é direcionado a menores de 18 anos. Não coletamos intencionalmente
            dados de menores. Se tomarmos conhecimento de que coletamos dados de um menor, eles
            serão excluídos imediatamente.
          </P>
        </Section>

        <Section title="9. Alterações nesta Política">
          <P>
            Podemos atualizar esta política periodicamente. Alterações significativas serão
            comunicadas via notificação no app ou e-mail. A data da última atualização está
            indicada no topo desta página.
          </P>
        </Section>
      </article>

      <Footer />
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-display font-bold text-2xl mb-4 text-primary">{title}</h2>
      <div className="space-y-3 text-secondary leading-relaxed">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function UL({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 ml-4">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-income shrink-0">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
