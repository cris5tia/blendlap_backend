FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

RUN mkdir -p public/images/productos \
             public/images/servicios \
             public/images/barberos \
             public/images/clientes

EXPOSE 3000

CMD ["node", "dist/app.js"]
