const config = {
  plugins: {
    "@tailwindcss/postcss": {
      content: [
        "./app/**/*.{js,ts,jsx,tsx}",
        "./node_modules/@sign-pay/react/dist/**/*.js",
      ],
    },
  },
};

export default config;
