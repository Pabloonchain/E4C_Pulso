import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStudentPassportOnChain } from '../src/stellar_pay';

/**
 * CONTROLADOR API: Consultar Pasaporte del Estudiante (GET).
 * Endpoint GET que recibe el address de la billetera del alumno por parámetro de consulta
 * y lee sus datos de reputación y desafíos del Smart Contract en Soroban.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  const { studentWallet } = req.query;

  // Validación básica del parámetro studentWallet
  if (!studentWallet || typeof studentWallet !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid studentWallet query parameter.' });
  }

  try {
    // CONSULTA BLOCKCHAIN: Ejecuta una lectura en Soroban (sin costo de gas/gasless)
    const passport = await getStudentPassportOnChain(studentWallet);
    
    // Si no tiene registros en el contrato, devuelve valores inicializados en cero
    if (!passport) {
      return res.status(404).json({
        message: 'Passport not found or student has no recorded activity.',
        studentWallet,
        reputation: 0,
        challenges: []
      });
    }

    return res.status(200).json(passport);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
