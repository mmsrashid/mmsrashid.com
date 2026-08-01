'use client'
import type { BloodMarkerWithResults } from '@/lib/health/types'

const ADVICE: Record<string, { diet: string; exercise: string; medications: string; lifestyle: string; gp: string }> = {
  'ALT': {
    diet: 'Reduce alcohol and ultra-processed foods. Increase leafy greens, olive oil, and coffee (shown to protect liver).',
    exercise: 'Aim for 150 min/week moderate aerobic exercise. Exercise reduces liver fat directly.',
    medications: 'Review all supplements and OTC medications with your GP — some are hepatotoxic.',
    lifestyle: 'Avoid alcohol entirely while elevated. Maintain healthy weight; even 5% weight loss reduces ALT.',
    gp: 'Ask about hepatic ultrasound, full liver screen, and whether a gastroenterology referral is warranted.',
  },
  'Vitamin D': {
    diet: 'Eat oily fish (salmon, mackerel), egg yolks, and fortified foods. Sun exposure on skin 10–30 min midday.',
    exercise: 'Outdoor exercise doubles benefit — exercise + sunlight simultaneously.',
    medications: 'Discuss supplementation — typically 1000–4000 IU D3 daily with K2 for co-absorption.',
    lifestyle: 'Spend time outdoors daily. Darker skin tones may need higher supplementation.',
    gp: 'Ask for a repeat test in 3 months after supplementing, and for optimal target level (>75 nmol/L).',
  },
  'Total Cholesterol': {
    diet: 'Reduce saturated fat (red meat, full-fat dairy). Increase soluble fibre (oats, legumes), nuts, and omega-3s.',
    exercise: 'Aerobic exercise raises HDL and lowers LDL. Target 30 min most days.',
    medications: 'Discuss statin therapy if cardiovascular risk is elevated alongside cholesterol.',
    lifestyle: 'Quit smoking if applicable. Manage stress — cortisol raises LDL.',
    gp: 'Ask for a cardiovascular risk score (QRISK3), not just the cholesterol number in isolation.',
  },
}

const DEFAULT = {
  diet: 'Maintain a balanced diet rich in vegetables, whole grains, and lean protein.',
  exercise: 'Regular moderate exercise (150 min/week) supports most metabolic markers.',
  medications: 'Discuss with your GP whether any supplements or medications could help.',
  lifestyle: 'Prioritise sleep, reduce stress, and avoid smoking.',
  gp: 'Ask your GP what target value you should aim for and in what timeframe.',
}

export default function ImprovementCard({ marker }: { marker: BloodMarkerWithResults }) {
  const advice = ADVICE[marker.name] ?? DEFAULT
  const sections = [
    { icon: '🥗', label: 'Diet', text: advice.diet },
    { icon: '🏃', label: 'Exercise', text: advice.exercise },
    { icon: '💊', label: 'Medications', text: advice.medications },
    { icon: '🌙', label: 'Lifestyle', text: advice.lifestyle },
  ]
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontSize: 13, fontWeight: 700 }}>How to improve {marker.name}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        {sections.map((s, i) => (
          <div key={s.label} style={{ padding: '12px 16px', borderBottom: i < 2 ? '1px solid #f3f4f6' : undefined, borderRight: i % 2 === 0 ? '1px solid #f3f4f6' : undefined }}>
            <div style={{ fontSize: 16, marginBottom: 4 }}>{s.icon} <strong style={{ fontSize: 11 }}>{s.label}</strong></div>
            <p style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.6 }}>{s.text}</p>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 16px', background: '#f0f9ff', borderTop: '1px solid #e5e7eb' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>Questions to ask your GP</p>
        <p style={{ fontSize: 11, color: '#1e40af' }}>{advice.gp}</p>
      </div>
    </div>
  )
}
