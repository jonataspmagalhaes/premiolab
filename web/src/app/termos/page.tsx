import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Termos de Uso — PremioLab',
  description: 'Termos e condições de uso do PremioLab.',
};

export default function TermosPage() {
  return (
    <main className="min-h-screen">
      <Header />

      <article className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="font-display font-extrabold text-4xl md:text-5xl mb-2">
          Termos de Uso
        </h1>
        <p className="text-sm text-muted mb-12">Última atualização: 10 de abril de 2026</p>

        <p className="text-secondary leading-relaxed mb-8">
          Ao utilizar o PremioLab (&quot;app&quot;, &quot;serviço&quot; ou &quot;plataforma&quot;),
          você concorda com estes Termos de Uso. Leia-os atentamente antes de utilizar o app.
        </p>

        <Section title="1. Aceitação dos Termos">
          <P>
            Ao criar uma conta ou utilizar o PremioLab, você declara ter pelo menos 18 anos de
            idade e aceita integralmente estes termos, bem como nossa{' '}
            <a href="/privacidade" className="text-income hover:underline">Política de Privacidade</a>.
          </P>
        </Section>

        <Section title="2. Descrição do Serviço">
          <P>
            O PremioLab é um aplicativo de acompanhamento de investimentos focado em renda
            mensal, que permite registrar e visualizar posições em ações, FIIs, ETFs, opções,
            renda fixa e proventos. Oferece ferramentas de projeção de renda, calculadora
            Black-Scholes, indicadores financeiros, simulador de FIIs e relatórios mensais.
          </P>
          <P><strong>O PremioLab NÃO é:</strong></P>
          <UL items={[
            'Uma corretora de valores ou instituição financeira.',
            'Um serviço de consultoria ou recomendação de investimentos.',
            'Um substituto para aconselhamento profissional financeiro, tributário ou jurídico.',
          ]} />
        </Section>

        <Section title="3. Isenção de Responsabilidade — Investimentos">
          <P>
            <strong>IMPORTANTE:</strong> O PremioLab é uma ferramenta de acompanhamento e
            análise. As informações, cálculos, indicadores e análises fornecidos pelo app têm
            caráter exclusivamente informativo e educacional.
          </P>
          <UL items={[
            'Nenhuma informação do app constitui recomendação de compra, venda ou manutenção de qualquer ativo.',
            'Projeções de renda mensal são estimativas baseadas em histórico — rentabilidade passada não garante rentabilidade futura.',
            'Cotações e dados de mercado são obtidos de fontes públicas (StatusInvest, Yahoo Finance) e podem apresentar atrasos ou imprecisões.',
            'Cálculos de IR, P&L, gregas e indicadores são aproximações e não substituem a apuração oficial.',
            'O usuário é integralmente responsável por suas decisões de investimento.',
          ]} />
        </Section>

        <Section title="4. Conta do Usuário">
          <P>
            Você é responsável por manter a confidencialidade de suas credenciais de acesso.
            Atividades realizadas com sua conta são de sua responsabilidade.
          </P>
          <P>Você concorda em fornecer informações verdadeiras e manter seus dados atualizados.</P>
        </Section>

        <Section title="5. Dados do Usuário">
          <P>
            Os dados financeiros que você insere no app (operações, saldos, proventos etc.) são
            de sua propriedade. Você pode exportá-los a qualquer momento via relatórios CSV ou
            backup.
          </P>
          <P>
            O tratamento dos seus dados é regido pela nossa{' '}
            <a href="/privacidade" className="text-income hover:underline">Política de Privacidade</a>.
          </P>
        </Section>

        <Section title="6. Planos e Assinaturas">
          <P>
            O PremioLab oferece um plano gratuito com funcionalidades básicas e o plano PRO com
            todas as features.
          </P>
          <UL items={[
            'PRO Mensal: R$ 14,99/mês cobrado mensalmente.',
            'PRO Anual: R$ 149,00/ano (~R$ 12,42/mês — 17% de desconto).',
            'Pagamentos processados pela Kiwify (PIX, boleto, cartão de crédito).',
            'O cancelamento pode ser feito a qualquer momento na sua área de assinatura. O acesso ao plano pago continua até o final do período já pago.',
            'Reembolsos seguem o Código de Defesa do Consumidor: você pode solicitar reembolso integral em até 7 dias após a compra (direito de arrependimento).',
          ]} />
        </Section>

        <Section title="7. Uso Aceitável">
          <P>Você concorda em não:</P>
          <UL items={[
            'Utilizar o app para fins ilegais ou fraudulentos.',
            'Criar múltiplas contas para explorar trials ou programas de indicação.',
            'Acessar ou tentar acessar dados de outros usuários.',
            'Realizar engenharia reversa, descompilar ou modificar o app.',
            'Sobrecarregar os servidores com requisições automatizadas.',
            'Revender, sublicenciar ou redistribuir o app ou seu conteúdo.',
          ]} />
        </Section>

        <Section title="8. Programa de Indicação">
          <P>O PremioLab pode oferecer um programa de indicação com recompensas. Regras:</P>
          <UL items={[
            'Cada usuário possui um código único de indicação.',
            'Indicações só são validadas quando o indicado cria uma conta paga.',
            'Tentativas de fraude (múltiplas contas, mesmo dispositivo) resultam em cancelamento das recompensas.',
            'Reservamo-nos o direito de alterar ou encerrar o programa a qualquer momento.',
          ]} />
        </Section>

        <Section title="9. Propriedade Intelectual">
          <P>
            O PremioLab, incluindo seu código, design, marca, logo e conteúdo, é protegido por
            direitos autorais e propriedade intelectual. O uso do app não transfere nenhum
            direito de propriedade ao usuário.
          </P>
        </Section>

        <Section title="10. Disponibilidade do Serviço">
          <P>
            Nos esforçamos para manter o app disponível, mas não garantimos funcionamento
            ininterrupto. O serviço pode ser temporariamente indisponível para manutenção,
            atualizações ou por circunstâncias fora de nosso controle.
          </P>
          <P>
            Dados de cotações dependem de APIs externas (StatusInvest, Yahoo Finance) que podem
            ficar indisponíveis ou descontinuadas.
          </P>
        </Section>

        <Section title="11. Limitação de Responsabilidade">
          <P>
            Na extensão máxima permitida por lei, o PremioLab não se responsabiliza por perdas
            financeiras decorrentes do uso do app, falhas técnicas, interrupções de serviço,
            imprecisões em cotações ou cálculos. O usuário concorda em usar o app por sua conta e
            risco.
          </P>
        </Section>

        <Section title="12. Alterações nos Termos">
          <P>
            Podemos atualizar estes termos periodicamente. Alterações significativas serão
            comunicadas via notificação no app ou e-mail. O uso continuado do app após as
            alterações constitui aceitação dos novos termos.
          </P>
        </Section>

        <Section title="13. Contato">
          <P>
            Para dúvidas, sugestões ou solicitações relacionadas a estes termos, entre em contato:{' '}
            <a href="mailto:contato@premiolab.com.br" className="text-income hover:underline">
              contato@premiolab.com.br
            </a>
          </P>
        </Section>

        <Section title="14. Foro">
          <P>
            Estes termos são regidos pelas leis do Brasil. Qualquer disputa será resolvida no
            foro da comarca do consumidor.
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
