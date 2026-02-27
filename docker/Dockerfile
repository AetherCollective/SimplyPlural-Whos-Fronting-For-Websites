FROM node:18
WORKDIR /app
COPY sp-relay.js /app/
RUN npm install express ws dotenv
CMD ["node", "sp-relay.js"]