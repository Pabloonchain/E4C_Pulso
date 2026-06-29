import { NextRequest, NextResponse } from 'next/server';
import {
  Contract,
  TransactionBuilder,
  Networks,
  rpc,
  Address,
  nativeToScVal
} from '@stellar/stellar-sdk';
import { getKMSClient } from '@/lib/kms';

const SorobanRpcServer = rpc.Server;
const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const server = new SorobanRpcServer(RPC_URL);
const contractId = process.env.ESCROW_CONTRACT_ID || 'CD5L453U2XWNG2K2ND5L4W7LWD6Z5N2WCD5L4W7LWD6Z5N2WCD5L4W7L';

export async function POST(req: NextRequest) {
  try {
    const { studentWallet, partnerId, amount } = await req.json();

    if (!studentWallet || !amount || partnerId === undefined) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    // 1. Obtener la cuenta fuente para conocer el Sequence Number actual
    const adminPublicKey = process.env.ADMIN_PUBLIC_KEY || 'GDQD...'; // SOLO la clave pública
    const sourceAccount = await server.getAccount(adminPublicKey);

    // 2. Construir la transacción de Soroban (Llamada al contrato Escrow)
    const contract = new Contract(contractId);
    
    // We build the transaction calling our Escrow claim_prize method
    const tx = new TransactionBuilder(sourceAccount, {
      fee: '100000',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          'claim_prize',
          Address.fromString(studentWallet).toScVal(),
          nativeToScVal(Number(partnerId), { type: 'u32' }),
          nativeToScVal(BigInt(amount), { type: 'i128' })
        )
      )
      .setTimeout(30) // Prevenir que exceda el timeout de Vercel
      .build();

    // 3. ESTÁNDAR DE LA INDUSTRIA: Firmar mediante KMS remoto
    // La clave privada NUNCA reside en la memoria de la función de Vercel
    const kms = getKMSClient();
    const txSigned = await kms.signTransaction(tx, process.env.KMS_KEY_ALIAS || 'alias/e4c-disbursement-key');

    // 4. Enviar a la red de forma asíncrona para evitar timeouts en Vercel
    const response = await server.sendTransaction(txSigned);

    if (response.status === 'PENDING') {
      return NextResponse.json({
        success: true,
        txHash: response.hash,
        status: response.status,
        message: 'Transacción enviada al relayer/red.'
      }, { status: 202 });
    }

    throw new Error(`Error en Soroban RPC: ${JSON.stringify(response.errorResult)}`);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
