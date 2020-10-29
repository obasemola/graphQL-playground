require('dotenv').config()
const { ApolloServer, UserInputError, gql, AuthenticationError } = require('apollo-server')
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const Book = require('./models/Book')
const Author = require('./models/Author')
const User = require('./models/User')

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


let authors = [
  {
    name: 'Robert Martin',
    id: "afa51ab0-344d-11e9-a414-719c6709cf3e",
    born: 1952,
  },
  {
    name: 'Martin Fowler',
    id: "afa5b6f0-344d-11e9-a414-719c6709cf3e",
    born: 1963
  },
  {
    name: 'Fyodor Dostoevsky',
    id: "afa5b6f1-344d-11e9-a414-719c6709cf3e",
    born: 1821
  },
  { 
    name: 'Joshua Kerievsky', // birthyear not known
    id: "afa5b6f2-344d-11e9-a414-719c6709cf3e",
  },
  { 
    name: 'Sandi Metz', // birthyear not known
    id: "afa5b6f3-344d-11e9-a414-719c6709cf3e",
  },
]

/*
 * Saattaisi olla järkevämpää assosioida kirja ja sen tekijä tallettamalla kirjan yhteyteen tekijän nimen sijaan tekijän id
 * Yksinkertaisuuden vuoksi tallennamme kuitenkin kirjan yhteyteen tekijän nimen
*/


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

      const author = await Author.findOne({ name: args.author })
      const authorID = author._id
      let returnedBookAuthors = await Book.find({}).then((books) => {
        return books.map((book) => {
          if(String(book.author) === String(authorID)){
            return book
          } else {
            return
          }
        })
      })

      returnedBookAuthors = returnedBookAuthors.filter(authorBook => authorBook !== undefined)
      console.log(returnedBookAuthors)
    },
    recommendations: async (root, args) => {
      let returnedBooks = await Book.find({}).then((books) => {
        return books.map((book) => {
          if(book.genres.includes(args.genre)){
            return book
          } else {
            return null
          }
        })
      })

      returnedBooks = returnedBooks.filter(returnedBook => returnedBook !== null)

      return returnedBooks
    },

    allAuthors: (root, args, context) => Author.find({}),

    me: (root, args, context) => {
      return context.loggedinUser
    }
  },

  Author: {
    bookCount: async (root) => {
      let count = 0
      await Book.find({}).then((books) => {
        books.map((book) => {
          if(String(root._id) === String(book.author)) {
            count = count + 1
          }
        })
      })

      return count
    }
  },

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
          return await book.save()
      }

      const book = new Book({
        ...args,
        author: authorObject })
      
      return await book.save()
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
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ req }) => {
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

server.listen().then(({ url }) => {
  console.log(`Server ready at ${url}`)
})