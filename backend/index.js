import { ApolloServer } from "@apollo/server";
import { startServerAndCreateLambdaHandler, handlers } from "@as-integrations/aws-lambda";
import { JSONFilePreset } from "lowdb/node";

// Read or create db.json
const defaultData = { posts: [], todos: [], users: [] };
const db = await JSONFilePreset("/tmp/db.json", defaultData);

await db.read();

const typeDefs = `#graphql
    type todos {
        id: ID!
        userId: ID!
        task: String!
        completed: Boolean!
    }

    type User {
        id: ID!
        username: String!
        email: String!
    }

    type Query {
        todos: [todos]
    }

    type Mutation {
        signup(username: String!, email: String!): User
        login(username: String!, email: String!): User
        addTodo(userId: ID!, task: String!): todos
        deleteTodo(id: ID!): todos
        completeTodo(id: ID!): todos
        updateTodoTask(id: ID!, task: String!): todos
    }
`;

const resolvers = {
  Query: {
    todos: () => db.data.todos,
  },
  Mutation: {
    signup: async (_, { username, email }) => {
      const newUser = {
        id: db.data.users.length + 1,
        username,
        email,
      };
      db.data.users.push(newUser);
      await db.write();
      return newUser;
    },
    login: async (_, { username, email }) => {
      const user = db.data.users.find(
        (user) => user.username === username && user.email === email
      );
      if (!user) throw new Error("User not found");
      return user;
    },
    addTodo: async (_, { userId, task }) => {
      const newTodo = {
        id: db.data.todos.length + 1,
        userId,
        task,
        completed: false,
      };
      db.data.todos.push(newTodo);
      await db.write();
      return newTodo;
    },
    deleteTodo: async (_, { id }) => {
      const numericId = Number(id);
      const index = db.data.todos.findIndex((todo) => todo.id === numericId);
      if (index === -1) throw new Error("Todo not found");
      const deletedTodo = db.data.todos.splice(index, 1)[0];
      await db.write();
      return deletedTodo;
    },
    completeTodo: async (_, { id }) => {
      const numericId = Number(id);
      const todo = db.data.todos.find((todo) => todo.id === numericId);
      if (!todo) throw new Error("Todo not found");
      todo.completed = !todo.completed;
      await db.write();
      return todo;
    },
    updateTodoTask: async (_, { id, task }) => {
      const numericId = Number(id);
      const todo = db.data.todos.find((todo) => todo.id === numericId);
      if (!todo) throw new Error("Todo not found");
      todo.task = task;
      await db.write();
      return todo;
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

export const graphqlHandler = startServerAndCreateLambdaHandler(
  server,
  // This line is new! Make sure you use the correct handler for your API Gateway configuration.
  // For API Gateway REST APIs, use `handlers.createAPIGatewayProxyEventRequestHandler()`.
  // For API Gateway HTTP APIs, use `handlers.createAPIGatewayProxyEventV2RequestHandler()`.
  handlers.createAPIGatewayProxyEventV2RequestHandler(),
  {
    context: async () => {
      try {
        await db.read();
        return { db };
      } catch (error) {
        console.error("Error initializing context:", error);
        throw error;
      }
    },
  }
);