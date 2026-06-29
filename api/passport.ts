import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStudentPassportOnChain } from '../src/stellar_pay';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  const { studentWallet } = req.query;

  if (!studentWallet || typeof studentWallet !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid studentWallet query parameter.' });
  }

  try {
    const passport = await getStudentPassportOnChain(studentWallet);
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
