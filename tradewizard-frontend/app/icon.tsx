import { ImageResponse } from 'next/og'

// Route segment config
export const runtime = 'edge'

// Image metadata
export const size = {
  width: 32,
  height: 32,
}
export const contentType = 'image/png'

// Image generation
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 18,
          background: 'linear-gradient(135deg, #111827 0%, #000000 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#818cf8',
          fontWeight: 900,
          fontFamily: 'system-ui, sans-serif',
          borderRadius: '6px',
          border: '0.5px solid rgba(255,255,255,0.1)',
        }}
      >
        T
      </div>
    ),
    {
      ...size,
    }
  )
}