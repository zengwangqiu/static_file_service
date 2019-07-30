FROM node:8.0.0
WORKDIR /app
ENV NODE_ENV production
COPY . /app
RUN npm config set registry https://registry.npm.taobao.org
RUN npm install
EXPOSE 3000
CMD [ "node", "app.js" ]