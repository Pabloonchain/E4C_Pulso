import type { VercelRequest, VercelResponse } from '@vercel/node';
import { updateStudentReputationOnChain } from '../src/stellar_pay';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { studentWallet, reputation } = req.body;

  if (!studentWallet || typeof studentWallet !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid studentWallet.' });
  }

  if (reputation === undefined || typeof reputation !== 'number') {
    return res.status(400).json({ error: 'Missing or invalid reputation.' });
  }

  try {
    const txHash = await updateStudentReputationOnChain(studentWallet, reputation);
    return res.status(200).json({
      success: true,
      message: `Student reputation updated to ${reputation}.`,
      txHash
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
