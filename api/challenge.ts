import type { VercelRequest, VercelResponse } from '@vercel/node';
import { addStudentChallengeOnChain } from '../src/stellar_pay';

/**
 * CONTROLADOR API: Registrar Desafío Escolar (Challenge).
 * Endpoint POST que recibe la billetera del alumno, el ID del desafío superado
 * y los puntos a sumar, e invoca el registro inmutable en Soroban.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { studentWallet, challengeId, reputationBoost } = req.body;

  // Validaciones básicas de parámetros de entrada
  if (!studentWallet || typeof studentWallet !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid studentWallet.' });
  }

  if (challengeId === undefined || typeof challengeId !== 'number') {
    return res.status(400).json({ error: 'Missing or invalid challengeId.' });
  }

  if (reputationBoost === undefined || typeof reputationBoost !== 'number') {
    return res.status(400).json({ error: 'Missing or invalid reputationBoost.' });
  }

  try {
    // REGISTRO BLOCKCHAIN: Registra el logro e incrementa la reputación del alumno on-chain
    const txHash = await addStudentChallengeOnChain(studentWallet, challengeId, reputationBoost);
    
    return res.status(200).json({
      success: true,
      message: `Challenge ${challengeId} registered for student.`,
      txHash
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
