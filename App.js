require('dotenv').config()
const { ApolloServer, UserInputError, gql, AuthenticationError } = require('apollo-server')
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const Book = require('./models/Book')
const Author = require('./models/Author')
const User = require('./models/User')
const { PubSub } = require('apollo-server')
const pubsub = new PubSub

const url = process.env.MONGODB_URI
const secretKey = process.env.JWT_SECRET

console.log('connecting to', url)

mongoose.connect(url, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true })
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch((error) => {
    console.log('error connecting to MongoDB:', error.message)
  })


const typeDefs = gql`

  type Author {
    name: String!
    bookCount: Int!
    born: Int
    id: ID!
  }

  type Book {
    title: String!
    published: Int!
    author: Author!
    id: ID!
    genres: [String!]!
  }

  type User {
    username: String!
    favouriteGenre: String!
    id: ID!
  }

  type Token {
    value: String!
  }

  type Query {
    authorCount: Int!
    bookCount: Int!
    allBooks(author: String, genre: String): [Book!]!
    allAuthors: [Author!]!
    me: User
    recommendations(genre: String): [Book!]!
  }

  type Subscription {
    bookAdded: Book!
  }

  type Mutation {
    addBook (
      title: String!
      published: Int!
      author: String!
      genres: [String!]!
    ): Book
    editAuthor(name: String!, setBornTo: Int!): Author
    createUser(
      username: String!
      favouriteGenre: String!
    ): User
    login(
      username: String!
      password: String!
    ): Token
  }
`

const resolvers = {
  Query: {
    authorCount: () => Author.collection.countDocuments(),
    bookCount: () => Book.collection.countDocuments(),
    allBooks: async (root, args) => {
      if(!args.author && !args.genre){
        return await Book.find({}).populate('author', { name: 1, born: 1 })
      }

      let returnedBookAuthors = await Book
        .find({})
        .populate('author', { name: 1, born: 1 })
        .then((books) => {
        return books
        .map((book) => {
          if(book.author.name === args.author){
            return book
          }
          else if(book.genres.includes(args.genre)){
            return book
          }
          else {
            return
          }
        })
      })

      //filtering undefined out of the array
      returnedBookAuthors = returnedBookAuthors.filter(authorBook => authorBook !== undefined)
      return returnedBookAuthors
    },
    recommendations: async (root, args) => {
      let returnedBooks = await Book
        .find({})
        .populate('author', { name: 1, born: 1 })
        .then((books) => {
        return books.map((book) => {
          if(book.genres.includes(args.genre)){
            return book
          } else {
            return null
          }
        })
      })

      //filtering null out
      returnedBooks = returnedBooks.filter(returnedBook => returnedBook !== null)

      return returnedBooks
    },

    allAuthors: (root, args, context) => Author.find({})
      //getting the count for books using schema.virtual
      .populate('bookCount'),

    me: (root, args, context) => {
      return context.loggedinUser
    }
  },

  //defining a separate resolver for the bookCount field
  // Author: {
  //   bookCount: async (root) => {
  //     let count = 0
  //     await Book.find({}).then((books) => {
  //       books.map((book) => {
  //         //turn the id and objectId to string otherwise, a comparison will always be false
  //         if(String(root._id) === String(book.author)) {
  //           count = count + 1
  //         }
  //       })
  //     })

  //     return count
  //   }
  // },

  Mutation: {
    addBook: async (root, args, context) => {
      const authorObject = await Author.findOne({ name: args.author })
      const loggedinUser = context.loggedinUser

      if(!loggedinUser) {
        throw new AuthenticationError("not authenticated")
      }

      if(!authorObject){
        const newAuthor = new Author({ name: args.author })
        if(args.author.length < 4){
          throw new UserInputError("Name of author must be at least 4 characters")
        } else if(args.title.length < 2){
          throw new UserInputError("Title must be at least 2 characters")
        }

        try {
          await newAuthor.save()
        } catch {
          throw new UserInputError(error.message, {
            invalidArgs: args
          })
        }


        const savedAuthorObject = await Author.findOne({ name: args.author })
        const book = new Book({
          ...args,
          author: savedAuthorObject })
          try {
            return await book.save()
          } catch {
            throw new UserInputError(error.message, {
              invalidArgs: args
            })
          }

      }

      const book = new Book({
        ...args,
        author: authorObject })
      
        try {
          await book.save()
        } catch(error) {
          throw new UserInputError(error.message, {
            invalidArgs: args
          })
        }

        pubsub.publish('BOOK_ADDED', { bookAdded: book })

        return book
      
      // console.log(loggedinUser)

    },

    editAuthor: async (root, args, context) => {

      const author = await Author.findOne({ name: args.name })
      const loggedinUser = context.loggedinUser

      if(!loggedinUser){
        throw new AuthenticationError('not authenticated')
      }

      if(!author){
        return null
      }

      const updatedAuthor = { name: args.name, born: args.setBornTo }

      const newUpdate = await Author.findByIdAndUpdate(author._id, updatedAuthor, { new: true })

      return newUpdate

    },

    createUser: async (root, args) => {
      const user = new User({ ...args })

      return await user.save()
        .catch((error) => {
          throw new UserInputError(error.message, {
            invalidArgs: args
          })
        })
    },

    login: async (root, args) => {
      const user = await User.findOne({ username: args.username })

      if(!user || args.password !== 'secret009'){
        throw new UserInputError('wrong credentials')
      }

      const userForToken = {
        username: user.username,
        id: user._id
      }

      return { value: jwt.sign(userForToken, secretKey) }

    }
  },
  Subscription: {
    bookAdded: {
      subscribe: () => pubsub.asyncIterator(['BOOK_ADDED'])
    }
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ req }) => {
    //getting the token saved in request authorization header
    const auth = req ? req.headers.authorization : null

    if(auth && auth.toLowerCase().startsWith('bearer')){

      const decodedToken = jwt.verify(
        auth.substring(7), secretKey
      )

      const loggedinUser = await User.findById(decodedToken.id)

      return { loggedinUser }
    }
  }
})

server.listen().then(({ url, subscriptionsUrl }) => {
  console.log(`Server ready at ${url}`)
  console.log(`subscriptions ready at ${subscriptionsUrl}`)
})