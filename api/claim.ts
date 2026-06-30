import type { VercelRequest, VercelResponse } from '@vercel/node';
import { claimPrizeOnChain } from '../src/stellar_pay';

/**
 * CONTROLADOR API: Procesar Reclamo de Premios (Claim).
 * Endpoint POST que recibe la billetera del alumno, el ID del partner y el monto del incentivo.
 * Invoca la ejecución directa en el contrato inteligente de Soroban.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { studentWallet, partnerId, amount } = req.body;

  // Validaciones básicas de parámetros
  if (!studentWallet || typeof studentWallet !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid studentWallet.' });
  }

  if (partnerId === undefined || typeof partnerId !== 'number') {
    return res.status(400).json({ error: 'Missing or invalid partnerId.' });
  }

  if (!amount || (typeof amount !== 'string' && typeof amount !== 'number')) {
    return res.status(400).json({ error: 'Missing or invalid amount (must be a number or string representation of BigInt).' });
  }

  try {
    // Convierte el monto a BigInt para cumplir con el formato de enteros grandes (i128) exigido por Soroban
    const bigAmount = BigInt(amount);

    // EJECUCIÓN BLOCKCHAIN: Llama a la función claimPrizeOnChain para invocar el Smart Contract de Soroban
    const txHash = await claimPrizeOnChain(studentWallet, partnerId, bigAmount);

    return res.status(200).json({
      success: true,
      message: `Claim of ${amount} processed successfully.`,
      txHash
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
