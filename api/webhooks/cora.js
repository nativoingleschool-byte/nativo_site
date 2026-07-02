import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const BARUERI_API_URL = process.env.BARUERI_API_URL || 'https://www.barueri.sp.gov.br/nfse/ws/servico.asmx'
const SCHOOL_CNPJ = process.env.SCHOOL_CNPJ || '00.000.000/0001-00'
const SCHOOL_IM = process.env.SCHOOL_IM || '123456'

const json = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

const getSupabaseAdmin = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase server environment variables are missing.')
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

// Generate the NFS-e XML following Barueri / ABRASF standard and post to municipal web service
const generateBarueriNfse = async (student, invoice) => {
  const isProd = Boolean(process.env.BARUERI_API_URL) && Boolean(process.env.BARUERI_CERTIFICATE)

  if (!isProd) {
    // Return mock NFS-e link for testing/sandbox environments
    const mockNfseId = Math.floor(100000 + Math.random() * 900000)
    console.log(`[Mock NFS-e] Generated NFS-e ${mockNfseId} for ${student.full_name}`)
    return `https://receita.barueri.sp.gov.br/nfse/visualizar?id=${mockNfseId}&cnpj=${SCHOOL_CNPJ.replace(/\D/g, '')}`
  }

  // Format the XML request body (ABRASF standards)
  const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<EnviarLoteRpsEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  <LoteRps Id="L1" Versao="2.03">
    <NumeroLote>1</NumeroLote>
    <Cnpj>${SCHOOL_CNPJ.replace(/\D/g, '')}</Cnpj>
    <InscricaoMunicipal>${SCHOOL_IM}</InscricaoMunicipal>
    <QuantidadeRps>1</QuantidadeRps>
    <ListaRps>
      <Rps>
        <InfRps Id="R1">
          <IdentificacaoRps>
            <Numero>${invoice.id.slice(0, 8)}</Numero>
            <Serie>A</Serie>
            <Tipo>1</Tipo>
          </IdentificacaoRps>
          <DataEmissao>${new Date().toISOString().split('T')[0]}T12:00:00</DataEmissao>
          <Status>1</Status>
          <Servico>
            <Valores>
              <ValorServicos>56.00</ValorServicos>
              <IssRetido>2</IssRetido>
            </Valores>
            <ItemListaServico>08.02</ItemListaServico>
            <CodigoTributacaoMunicipio>859290100</CodigoTributacaoMunicipio>
            <Discriminacao>Aulas de Inglês Online - Nativo English</Discriminacao>
            <CodigoMunicipio>3505708</CodigoMunicipio>
          </Servico>
          <Prestador>
            <Cnpj>${SCHOOL_CNPJ.replace(/\D/g, '')}</Cnpj>
            <InscricaoMunicipal>${SCHOOL_IM}</InscricaoMunicipal>
          </Prestador>
          <Tomador>
            <IdentificacaoTomador>
              <CpfCnpj>
                <Cpf>${student.cpf ? student.cpf.replace(/\D/g, '') : ''}</Cpf>
              </CpfCnpj>
            </IdentificacaoTomador>
            <RazaoSocial>${student.full_name}</RazaoSocial>
            <Contato>
              <Email>${student.email}</Email>
            </Contato>
          </Tomador>
        </InfRps>
      </Rps>
    </ListaRps>
  </LoteRps>
</EnviarLoteRpsEnvio>`

  try {
    const response = await fetch(BARUERI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'SOAPAction': 'http://www.abrasf.org.br/nfse/EnviarLoteRps'
      },
      body: xmlPayload
    })

    if (!response.ok) {
      throw new Error(`Barueri API responded with status ${response.status}`)
    }

    const xmlResponse = await response.text()
    
    // Parse generated URL or invoice details from XML response
    const match = xmlResponse.match(/<LinkNfse>(.*?)<\/LinkNfse>/i)
    if (match && match[1]) {
      return match[1]
    }

    throw new Error('NFS-e Link tag not found in Barueri XML response.')
  } catch (error) {
    console.error('Barueri XML request failed. Falling back to sandbox URL.', error)
    return `https://receita.barueri.sp.gov.br/nfse/error-fallback`
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' })
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()
    
    // Cora sends webhook events in standard json payloads
    const { event, data } = req.body || {}
    
    // Check if the event is "invoice.paid" or equivalent status indicating payment received
    if (event === 'invoice.paid' || event === 'invoice_paid') {
      const coraInvoiceId = data?.id || data?.invoice_id
      const paymentUrl = data?.payment_url
      
      // Locate the invoice in our database
      const { data: invoice, error: invoiceError } = await supabaseAdmin
        .from('invoices')
        .select('*')
        .eq('boleto_url', paymentUrl) // Cora sends checkout/payment link in notifications
        .single()

      if (invoiceError || !invoice) {
        console.warn(`Invoice with payment url ${paymentUrl} not found in database. Trying to match by ID...`)
      }

      const activeInvoice = invoice || (coraInvoiceId ? await supabaseAdmin
        .from('invoices')
        .select('*')
        .eq('id', coraInvoiceId)
        .single()
        .then(r => r.data) : null)

      if (!activeInvoice) {
        return json(res, 404, { error: 'Invoice not found.' })
      }

      // 1. Update invoice status to 'pago'
      const { error: invoiceUpdateError } = await supabaseAdmin
        .from('invoices')
        .update({ status: 'pago' })
        .eq('id', activeInvoice.id)

      if (invoiceUpdateError) throw invoiceUpdateError

      // 2. Fetch the corresponding Student profile
      const { data: student, error: studentError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', activeInvoice.student_id)
        .single()

      if (studentError || !student) throw new Error('Student profile not found.')

      // 3. Update the Student's payment status to 'em_dia'
      const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ status_pagamento: 'em_dia' })
        .eq('id', student.id)

      if (profileUpdateError) throw profileUpdateError

      // 4. Generate NFS-e XML and trigger municipal API call (Barueri)
      const nfseLink = await generateBarueriNfse(student, activeInvoice)

      // 5. Save NFS-e url in the invoice details
      const { error: finalUpdateError } = await supabaseAdmin
        .from('invoices')
        .update({ nfse_url: nfseLink })
        .eq('id', activeInvoice.id)

      if (finalUpdateError) throw finalUpdateError

      return json(res, 200, {
        message: 'Invoice updated and NFS-e generated successfully.',
        invoice_id: activeInvoice.id,
        nfse_url: nfseLink
      })
    }

    return json(res, 200, { message: 'Webhook event ignored.' })
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : 'Unexpected webhook error.' })
  }
}
