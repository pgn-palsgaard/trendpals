/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		fontFamily: {
  			heading: ['Lora', 'Georgia', 'serif'],
  			body: ['Inter', 'system-ui', 'sans-serif'],
  			sans: ['Inter', 'system-ui', 'sans-serif'],
  			serif: ['Lora', 'Georgia', 'serif'],
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			// Palsgaard CVI primaries
  			'pal-blue': '#1D428A',
  			'pal-dark': '#1D2B47',
  			'pal-gold': '#F7F4EE',
  			// Palsgaard CVI secondaries
  			'pal-sage': '#6F8263',
  			'pal-sage-lt': '#B8C4B1',
  			'pal-red': '#C15338',
  			'pal-teal': '#62837F',
  			'pal-warm-gold': '#AB9D80',
  			'pal-yellow': '#F2C75C',
  			'pal-chocolate': '#5A361F',
  			// Tints
  			'pal-blue-10': '#EBF0F8',
  			'pal-blue-25': '#C5D2EC',
  			'pal-dark-10': '#EBECEf',
  			'pal-red-10': '#FAE9E5',
  			'pal-sage-10': '#EEF1EC',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		boxShadow: {
  			'card': '0 1px 4px 0 rgba(29,42,71,0.06), 0 0 0 1px rgba(29,42,71,0.05)',
  			'card-hover': '0 4px 16px 0 rgba(29,42,71,0.10), 0 0 0 1px rgba(29,42,71,0.07)',
  			'panel': '0 2px 8px 0 rgba(29,42,71,0.08)',
  			'sm': '0 1px 3px 0 rgba(29,42,71,0.08)',
  		},
  		keyframes: {
  			'accordion-down': {
  				from: { height: '0' },
  				to: { height: 'var(--radix-accordion-content-height)' }
  			},
  			'accordion-up': {
  				from: { height: 'var(--radix-accordion-content-height)' },
  				to: { height: '0' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
